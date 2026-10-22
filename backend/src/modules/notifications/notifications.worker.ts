import { randomUUID } from 'node:crypto';
import type { NotificationsRepository, PushAttempt, PushResult, PushTransport } from './notifications.types';
import { PushTransportError, ExpoPushTransport } from './expo.transport';
import { notificationsRepository } from './notifications.repository';

/** Lease e resultado persistidos: reiniciar o processo não perde a fila. */
export class NotificationsWorker {
  private running: Promise<void> | null = null;
  constructor(
    private repo: NotificationsRepository,
    private transport: PushTransport,
    private now: () => number = Date.now,
  ) {}
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async run() {
    await this.repo.materialize();
    for (let i = 0; i < 20; i++) {
      const a = await this.repo.claim(new Date(this.now()), randomUUID());
      if (!a) return;
      // Recibo não envia outra mensagem: pode ser consultado mesmo se a entrega já mudou.
      if (this.now() - a.createdAt.getTime() > 86_400_000 || (a.phase === 'send' && !(await this.repo.eligible(a)))) {
        await this.repo.finish(a, { status: 'SKIPPED', nextAt: new Date(this.now()), errorCode: 'NoLongerEligible' });
        continue;
      }
      try {
        const r = a.phase === 'send' ? await this.transport.send(a) : await this.transport.receipt(a.ticketId!);
        if (!r) {
          await this.retry(a, 'ReceiptPending', true);
          continue;
        }
        await this.accept(a, r);
      } catch (error) {
        const known = error instanceof PushTransportError ? error : new PushTransportError('PushUnexpectedError', true);
        await this.retry(a, known.code, known.retryable);
      }
    }
  }
  private async accept(a: PushAttempt, r: PushResult) {
    if (r.status === 'error') {
      await this.retry(
        a,
        r.code ?? 'ProviderError',
        r.code === 'MessageRateExceeded' || r.code === 'ServiceUnavailable',
        r.code === 'DeviceNotRegistered',
      );
      return;
    }
    await this.repo.finish(a, {
      status: a.phase === 'send' ? 'TICKET' : 'DELIVERED',
      ticketId: r.id,
      nextAt: new Date(this.now() + 15 * 60_000),
    });
  }
  private async retry(a: PushAttempt, code: string, retryable: boolean, disableDevice = false) {
    const count = a.phase === 'send' ? a.attempts : a.receiptAttempts;
    const retry = retryable && count < 8 && this.now() - a.createdAt.getTime() < 86_400_000;
    await this.repo.finish(a, {
      status: retry ? (a.phase === 'send' ? 'PENDING' : 'TICKET') : 'FAILED',
      nextAt: new Date(
        this.now() + (a.phase === 'receipt' ? 15 * 60_000 : Math.min(3_600_000, 5000 * 2 ** Math.min(count - 1, 10))),
      ),
      errorCode: code.slice(0, 80),
      disableDevice,
    });
  }
}

export function startNotificationsWorker() {
  // Opt-in de ambiente: testes e instalações sem FCM nunca enviam pushes reais por acidente.
  if (process.env.EXPO_PUSH_ENABLED !== 'true') return () => undefined;
  const worker = new NotificationsWorker(notificationsRepository, new ExpoPushTransport(process.env.EXPO_ACCESS_TOKEN));
  let stopped = false;
  let warned = false;
  const tick = () => {
    if (!stopped)
      void worker
        .tick()
        .then(() => {
          warned = false;
        })
        .catch(() => {
          if (!warned) console.warn('[notificações] Não foi possível processar a fila; haverá nova tentativa.');
          warned = true;
        });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

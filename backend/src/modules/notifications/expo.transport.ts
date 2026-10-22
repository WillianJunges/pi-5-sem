import type { PushAttempt, PushResult, PushTransport } from './notifications.types';

export class PushTransportError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}
const bodies = {
  ASSIGNED: 'Uma entrega foi atribuída a você.',
  UNASSIGNED: 'A atribuição de uma entrega mudou.',
  CANCELLED: 'Uma entrega atribuída foi cancelada.',
  OUT_FOR_DELIVERY: 'Seu pedido saiu para entrega.',
};
function result(value: unknown): PushResult {
  const r = value as { status?: string; id?: string; details?: { error?: string } } | undefined;
  if (!r || !['ok', 'error'].includes(r.status ?? '')) throw new PushTransportError('InvalidProviderResponse', true);
  return {
    status: r.status as PushResult['status'],
    id: r.id,
    code: r.details?.error ?? (r.status === 'error' ? 'ProviderError' : undefined),
  };
}
/** Conteúdo genérico: endereço, telefone, coordenadas e credenciais nunca entram no push. */
export class ExpoPushTransport implements PushTransport {
  constructor(
    private accessToken?: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async post(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetcher(`https://exp.host/--/api/v2/push/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new PushTransportError(`ExpoHTTP${response.status}`, response.status === 429 || response.status >= 500);
      const data = (await response.json()) as { data?: unknown; errors?: unknown };
      if (!data.data || data.errors) throw new PushTransportError('InvalidProviderResponse', true);
      return data.data;
    } catch (error) {
      if (error instanceof PushTransportError) throw error;
      throw new PushTransportError('PushNetworkError', true);
    } finally {
      clearTimeout(timer);
    }
  }
  async send(a: PushAttempt): Promise<PushResult> {
    const data = await this.post('send', [
      {
        to: a.token,
        title: 'Di Casa',
        body: bodies[a.kind],
        sound: 'default',
        channelId: 'deliveries',
        data: {
          version: 1,
          eventId: a.eventId,
          userId: a.userId,
          deliveryId: a.deliveryId,
          orderId: a.orderId,
          type: a.kind,
        },
      },
    ]);
    if (!Array.isArray(data) || data.length !== 1) throw new PushTransportError('InvalidProviderResponse', true);
    const r = result(data[0]);
    if (r.status === 'ok' && !r.id) throw new PushTransportError('MissingTicket', true);
    return r;
  }
  async receipt(ticketId: string): Promise<PushResult | null> {
    const data = (await this.post('getReceipts', { ids: [ticketId] })) as Record<string, unknown>;
    return data[ticketId] ? result(data[ticketId]) : null;
  }
}

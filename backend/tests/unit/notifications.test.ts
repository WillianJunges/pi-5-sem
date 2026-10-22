import { describe, it, expect, vi } from 'vitest';
import { NotificationsWorker } from '../../src/modules/notifications/notifications.worker';
import { ExpoPushTransport, PushTransportError } from '../../src/modules/notifications/expo.transport';
import type {
  NotificationsRepository,
  PushAttempt,
  PushTransport,
} from '../../src/modules/notifications/notifications.types';

const now = Date.parse('2026-10-22T15:00:00Z');
const attempt = (overrides: Partial<PushAttempt> = {}): PushAttempt => ({
  id: 'a',
  eventId: 'event',
  deviceId: 'device',
  bindingVersion: 1,
  userId: 'user',
  deliveryId: 'delivery',
  orderId: 'order',
  kind: 'ASSIGNED',
  token: 'ExpoPushToken[test-token]',
  attempts: 1,
  receiptAttempts: 0,
  leaseId: 'lease',
  ticketId: null,
  phase: 'send',
  createdAt: new Date(now),
  ...overrides,
});
function fixture(input = attempt()) {
  const repo = {
    materialize: vi.fn(async () => {}),
    claim: vi.fn<NotificationsRepository['claim']>().mockResolvedValueOnce(input).mockResolvedValue(null),
    eligible: vi.fn(async () => true),
    finish: vi.fn(async () => {}),
  };
  const transport = {
    send: vi.fn<PushTransport['send']>().mockResolvedValue({ status: 'ok', id: 'ticket' }),
    receipt: vi.fn<PushTransport['receipt']>().mockResolvedValue({ status: 'ok' }),
  };
  return { repo, transport, worker: new NotificationsWorker(repo, transport, () => now) };
}
describe('Worker durável de notificações', () => {
  it('não envia para evento obsoleto ou conta/dispositivo sem elegibilidade', async () => {
    const f = fixture();
    f.repo.eligible.mockResolvedValue(false);
    await f.worker.tick();
    expect(f.transport.send).not.toHaveBeenCalled();
    expect(f.repo.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'SKIPPED' }));
  });
  it('limita idade e não envia uma fila histórica', async () => {
    const f = fixture(attempt({ createdAt: new Date(now - 86_400_001) }));
    await f.worker.tick();
    expect(f.transport.send).not.toHaveBeenCalled();
  });
  it('separa ticket aceito de recibo confirmado e respeita prazo de consulta', async () => {
    const f = fixture();
    await f.worker.tick();
    expect(f.repo.finish).toHaveBeenCalledWith(expect.anything(), {
      status: 'TICKET',
      ticketId: 'ticket',
      nextAt: new Date(now + 900_000),
    });
    const r = fixture(attempt({ phase: 'receipt', ticketId: 'ticket' }));
    await r.worker.tick();
    expect(r.transport.send).not.toHaveBeenCalled();
    expect(r.transport.receipt).toHaveBeenCalledWith('ticket');
    expect(r.repo.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'DELIVERED' }));
  });
  it('falha temporária agenda retry, preservando o evento e usando a mesma identificação', async () => {
    const f = fixture();
    f.transport.send.mockRejectedValue(new PushTransportError('PushNetworkError', true));
    await f.worker.tick();
    expect(f.repo.finish).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event' }),
      expect.objectContaining({ status: 'PENDING', nextAt: new Date(now + 5000), errorCode: 'PushNetworkError' }),
    );
  });
  it('erro de credenciais é terminal e não desativa o token do usuário', async () => {
    const f = fixture();
    f.transport.send.mockResolvedValue({ status: 'error', code: 'InvalidCredentials' });
    await f.worker.tick();
    expect(f.repo.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'FAILED', disableDevice: false }),
    );
  });
  it('DeviceNotRegistered desativa apenas a versão do token reclamado', async () => {
    const f = fixture();
    f.transport.send.mockResolvedValue({ status: 'error', code: 'DeviceNotRegistered' });
    await f.worker.tick();
    expect(f.repo.finish).toHaveBeenCalledWith(
      expect.objectContaining({ bindingVersion: 1 }),
      expect.objectContaining({ disableDevice: true, status: 'FAILED' }),
    );
  });
  it('recibo ainda ausente tem retry separado e limite de oito consultas', async () => {
    const f = fixture(attempt({ phase: 'receipt', ticketId: 'ticket', receiptAttempts: 8 }));
    f.transport.receipt.mockResolvedValue(null);
    await f.worker.tick();
    expect(f.repo.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'FAILED', errorCode: 'ReceiptPending' }),
    );
  });
  it('ciclos simultâneos usam um único worker', async () => {
    const f = fixture();
    await Promise.all([f.worker.tick(), f.worker.tick()]);
    expect(f.repo.materialize).toHaveBeenCalledTimes(1);
    expect(f.transport.send).toHaveBeenCalledTimes(1);
  });
});
describe('Transporte Expo sem rede externa', () => {
  it('envia só identificadores e texto genérico, com token de serviço opcional', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket' }] }), { status: 200 }));
    const transport = new ExpoPushTransport('service-test', fetcher);
    expect(await transport.send(attempt())).toEqual({ status: 'ok', id: 'ticket', code: undefined });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const body = JSON.parse(options!.body as string)[0];
    expect(Object.keys(body.data).sort()).toEqual(['deliveryId', 'eventId', 'orderId', 'type', 'userId', 'version']);
    expect(JSON.stringify(body)).not.toMatch(/latitude|address|phone|refreshToken/);
  });
  it('HTTP 429 permite retry e HTTP 401 exige correção de configuração', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const transport = new ExpoPushTransport(undefined, fetcher);
    await expect(transport.send(attempt())).rejects.toMatchObject({ code: 'ExpoHTTP429', retryable: true });
    await expect(transport.send(attempt())).rejects.toMatchObject({ code: 'ExpoHTTP401', retryable: false });
  });
  it('recibo ausente e resposta malformada não são tratados como entrega confirmada', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ status: 'ok' }] })));
    const transport = new ExpoPushTransport(undefined, fetcher);
    expect(await transport.receipt('ticket')).toBeNull();
    await expect(transport.send(attempt())).rejects.toMatchObject({ code: 'MissingTicket' });
  });
});

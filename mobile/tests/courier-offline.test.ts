import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourierOfflineService } from '../src/features/courier/offline/service';
import { SqliteCourierStorage } from '../src/features/courier/offline/sqliteStorage';
import { CourierLocalError } from '../src/features/courier/offline/types';
import { DeliveryDetailsModel, DeliveriesListModel } from '../src/features/courier/models';
import { canCompleteDelivery, isDeliveryActive } from '../src/features/courier/presentation';
import type { DeliveriesGateway, Delivery, DeliveryCompletion } from '../src/services/deliveries.service';
import { TestCourierDatabase } from './support/courierDatabase';

const operation = (): DeliveryCompletion => ({ operationId: randomUUID(), completedAt: '2026-10-22T14:30:00.000Z' });
const offline = { status: 0, message: 'Sem conexão' };
function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return { id: 'd1', orderId: 'o1', courierId: 'a', courierName: 'Yuri', status: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY',
    customer: { name: 'Ana', phone: '(19) 99999-8888' },
    address: { label: 'Casa', street: 'Rua Teste', number: '10', complement: 'Portão azul', district: 'Centro', city: 'Indaiatuba',
      state: 'SP', cep: '13330010', latitude: -23.088, longitude: -47.216 },
    notes: null, paymentMethod: 'CASH', total: 26, changeFor: 50, createdAt: '2026-10-22T14:00:00.000Z', assignedAt: '2026-10-22T14:01:00.000Z',
    startedAt: '2026-10-22T14:10:00.000Z', completedAt: null, completionReceivedAt: null, cancelledAt: null, ...overrides };
}
function completed(input: DeliveryCompletion, row = delivery()): Delivery {
  return { ...row, status: 'COMPLETED', orderStatus: 'DELIVERED', completedAt: input.completedAt, completionReceivedAt: '2026-10-22T14:31:00.000Z' };
}
function api() {
  return {
    list: vi.fn<DeliveriesGateway['list']>().mockResolvedValue({ deliveries: [delivery()], hasMore: false }),
    get: vi.fn<DeliveriesGateway['get']>().mockResolvedValue(delivery()),
    start: vi.fn<DeliveriesGateway['start']>().mockResolvedValue(delivery()),
    complete: vi.fn<DeliveriesGateway['complete']>().mockImplementation(async (id, input) => completed(input, delivery({ id }))),
  };
}
const databases: TestCourierDatabase[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
function storage(path?: string) {
  const database = new TestCourierDatabase(path); databases.push(database);
  return { database, store: new SqliteCourierStorage(async () => database) };
}
function service(store: SqliteCourierStorage, remote = api()) {
  let clock = 100_000;
  let account = 'a';
  const sync = new CourierOfflineService('a', remote, store, async () => account === 'a', randomUUID, () => clock);
  return { sync, remote, advance: (ms: number) => { clock += ms; }, switchAccount: (id: string) => { account = id; } };
}

describe('SQLite durável e isolamento de contas', () => {
  it('preserva cache e chave exata após fechar e reabrir o arquivo', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'courier-test-')); directories.push(directory);
    const filename = path.join(directory, 'courier.db');
    const first = storage(filename); const input = operation();
    await first.store.save('a', [delivery()]); await first.store.enqueue('a', 'd1', input);
    first.database.close(); databases.splice(databases.indexOf(first.database), 1);
    const second = storage(filename);
    expect((await second.store.get('a', 'd1'))?.address.complement).toBe('Portão azul');
    expect((await second.store.pending('a'))[0]).toMatchObject({ ...input, deliveryId: 'd1', status: 'pending' });
    const worker = service(second.store); await worker.sync.activate(); worker.sync.deactivate();
    expect(worker.remote.complete).toHaveBeenCalledWith('d1', input);
    expect(await second.store.pending('a')).toEqual([]);
  });
  it('não mostra ou sincroniza pendências de outra conta no mesmo arquivo', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.save('b', [delivery({ id: 'd2', courierId: 'b' })]);
    await store.enqueue('a', 'd1', operation());
    expect(await store.get('b', 'd1')).toBeNull(); expect(await store.pending('b')).toEqual([]);
    const remote = api(); const other = new CourierOfflineService('b', remote, store, async () => true, randomUUID);
    await other.activate(); other.deactivate(); expect(remote.complete).not.toHaveBeenCalled();
    expect(await store.pending('a')).toHaveLength(1);
  });
  it('duas conclusões locais simultâneas preservam uma só operação', async () => {
    const { store } = storage(); await store.save('a', [delivery()]);
    const rows = await Promise.all([store.enqueue('a', 'd1', operation()), store.enqueue('a', 'd1', operation())]);
    expect(rows[0].operationId).toBe(rows[1].operationId); expect(await store.pending('a')).toHaveLength(1);
  });
  it('rejeita entrega sem início, sem cache ou pertencente a outro motoboy', async () => {
    const { store } = storage();
    await expect(store.save('b', [delivery()])).rejects.toMatchObject({ status: 404 });
    await expect(store.enqueue('a', 'd1', operation())).rejects.toMatchObject({ status: 409 });
    await store.save('a', [delivery({ status: 'ASSIGNED', orderStatus: 'READY', startedAt: null })]);
    await expect(store.enqueue('a', 'd1', operation())).rejects.toMatchObject({ status: 409 });
    expect(await store.pending('a')).toEqual([]);
  });
  it('cache atualizado não apaga a intenção; leitura atrasada não reabre conclusão confirmada', async () => {
    const { store } = storage(); const input = operation(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', input);
    await store.save('a', [delivery()]); expect(await store.pending('a')).toHaveLength(1);
    await store.acknowledge('a', input.operationId, completed(input));
    await store.save('a', [delivery()]); expect((await store.get('a', 'd1'))?.status).toBe('COMPLETED');
  });
  it('só apaga a fila depois de confirmar a operação e gravar o cache na mesma transação', async () => {
    const { database, store } = storage(); const input = operation(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', input);
    database.raw.exec("CREATE TRIGGER fail_ack BEFORE UPDATE ON courier_cache BEGIN SELECT RAISE(ABORT, 'disk error'); END;");
    await expect(store.acknowledge('a', input.operationId, completed(input))).rejects.toBeInstanceOf(CourierLocalError);
    expect(await store.pending('a')).toHaveLength(1); expect((await store.get('a', 'd1'))?.status).toBe('IN_PROGRESS');
    database.raw.exec('DROP TRIGGER fail_ack'); await store.acknowledge('a', input.operationId, completed(input));
    expect(await store.pending('a')).toEqual([]);
  });
  it('não aceita confirmação de outra entrega nem remove a fila por uma leitura GET', async () => {
    const { store } = storage(); const input = operation(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', input);
    await expect(store.acknowledge('a', input.operationId, completed(input, delivery({ id: 'outra' })))).rejects.toBeInstanceOf(CourierLocalError);
    await store.save('a', [completed(input)]); expect(await store.pending('a')).toHaveLength(1);
  });
  it('bloqueia a conta desativada e não perde suas pendências', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', operation()); await store.block('a', true);
    const worker = service(store); worker.sync.setOnline(false);
    await expect(worker.sync.cachedGet('d1')).rejects.toMatchObject({ status: 403 });
    await expect(worker.sync.complete('d1', operation())).rejects.toMatchObject({ status: 403 });
    expect(await store.pending('a')).toHaveLength(1);
  });
  it('reabertura recupera a tentativa cujo processo morreu durante o envio', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'courier-lease-')); directories.push(directory);
    const filename = path.join(directory, 'courier.db'); const first = storage(filename); const input = operation();
    await first.store.save('a', [delivery()]); await first.store.enqueue('a', 'd1', input); await first.store.claim('a', 1000, 'old-process');
    first.database.close(); databases.splice(databases.indexOf(first.database), 1);
    const second = storage(filename);
    expect(await second.store.claim('a', 10_000, 'new-process')).toBeNull();
    expect(await second.store.claim('a', 61_001, 'new-process')).toMatchObject({ ...input, attempts: 2 });
  });
  it('persiste apenas os campos da entrega e não aceita operação malformada', async () => {
    const { store, database } = storage();
    await store.save('a', [{ ...delivery(), refreshToken: 'never-store-this-token', localCompletion: { status: 'pending', completedAt: operation().completedAt, message: null } } as Delivery]);
    const data = String(database.raw.prepare('SELECT data FROM courier_cache').get()?.data);
    expect(data).not.toContain('refreshToken'); expect(data).not.toContain('localCompletion');
    await expect(store.enqueue('a', 'd1', { operationId: 'invalid', completedAt: 'invalid' })).rejects.toMatchObject({ status: 409 });
    expect(await store.pending('a')).toEqual([]);
  });
});

describe('Sincronização e conflitos', () => {
  it('offline registra localmente, sai das ativas e entra nas pendências sem fingir status oficial', async () => {
    const { store } = storage(); await store.save('a', [delivery()]);
    const worker = service(store); worker.sync.setOnline(false); await worker.sync.activate();
    const local = await worker.sync.complete('d1', operation());
    expect(local.status).toBe('IN_PROGRESS'); expect(local.localCompletion?.status).toBe('pending');
    expect(isDeliveryActive(local)).toBe(false); expect(canCompleteDelivery(local)).toBe(false);
    expect((await worker.sync.cachedList(true)).deliveries).toEqual([]);
    expect((await worker.sync.cachedList(false)).deliveries).toHaveLength(1);
    expect(worker.remote.complete).not.toHaveBeenCalled(); worker.sync.deactivate();
  });
  it('envia uma vez em dois gatilhos simultâneos e confirma o resultado no cache', async () => {
    const { store } = storage(); const input = operation(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', input);
    const worker = service(store); await Promise.all([worker.sync.activate(), worker.sync.sync()]); worker.sync.deactivate();
    expect(worker.remote.complete).toHaveBeenCalledTimes(1); expect(await store.pending('a')).toEqual([]);
    expect((await store.get('a', 'd1'))?.status).toBe('COMPLETED');
  });
  it('recuperação de rede sincroniza a chave persistida', async () => {
    const { store } = storage(); const input = operation(); await store.save('a', [delivery()]);
    const worker = service(store); worker.sync.setOnline(false); await worker.sync.activate(); await worker.sync.complete('d1', input);
    worker.sync.setOnline(true); await worker.sync.sync(); worker.sync.deactivate();
    expect(worker.remote.complete).toHaveBeenCalledWith('d1', input); expect(await store.pending('a')).toEqual([]);
  });
  it('resposta perdida mantém a operação e respeita backoff antes do reenvio idempotente', async () => {
    const { store } = storage(); const input = operation(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', input);
    const remote = api(); remote.complete.mockRejectedValueOnce(offline);
    const worker = service(store, remote); await worker.sync.activate();
    expect((await store.pending('a'))[0]).toMatchObject({ ...input, attempts: 1, status: 'pending' });
    await worker.sync.sync(); expect(remote.complete).toHaveBeenCalledTimes(1);
    worker.advance(5000); await worker.sync.sync(); worker.sync.deactivate();
    expect(remote.complete.mock.calls.map(call => call[1])).toEqual([input, input]); expect(await store.pending('a')).toEqual([]);
  });
  it.each([400, 409, 422])('HTTP %s vira conflito visível e não é sobrescrito silenciosamente', async status => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', operation());
    const remote = api(); remote.complete.mockRejectedValueOnce({ status }); const worker = service(store, remote);
    await worker.sync.activate(); worker.advance(600_000); await worker.sync.sync(true); worker.sync.deactivate();
    expect((await store.pending('a'))[0].status).toBe('conflict'); expect(remote.complete).toHaveBeenCalledTimes(1);
  });
  it('perda de atribuição remove o endereço, mas preserva a pendência para revisão', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', operation());
    const remote = api(); remote.complete.mockRejectedValueOnce({ status: 404 }); const worker = service(store, remote);
    await worker.sync.activate(); worker.sync.deactivate();
    expect(await store.get('a', 'd1')).toBeNull(); expect((await store.pending('a'))[0]).toMatchObject({ status: 'conflict', orderId: 'o1' });
  });
  it('resposta antiga não restaura um endereço cujo acesso já foi revogado', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); const remote = api();
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let respond!: (value: Delivery) => void; const answer = new Promise<Delivery>(resolve => { respond = resolve; });
    remote.get.mockImplementationOnce(async () => { entered(); return answer; }).mockRejectedValueOnce({ status: 404 });
    const worker = service(store, remote); const old = worker.sync.get('d1');
    const outcome = expect(old).rejects.toMatchObject({ status: 409 }); await started;
    await expect(worker.sync.get('d1')).rejects.toMatchObject({ status: 404 });
    respond(delivery()); await outcome; expect(await store.get('a', 'd1')).toBeNull();
  });
  it('leitura antiga não desbloqueia a conta recusada enquanto o cache era gravado', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); const remote = api();
    const write = store.save.bind(store);
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let resume!: () => void; const waiting = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(store, 'save').mockImplementationOnce(async (...args) => { await write(...args); entered(); await waiting; });
    remote.get.mockResolvedValueOnce(delivery()).mockRejectedValueOnce({ status: 403 });
    const worker = service(store, remote); const old = worker.sync.get('d1'); const outcome = expect(old).rejects.toMatchObject({ code: 'access_changed' });
    await started; await expect(worker.sync.get('d1')).rejects.toMatchObject({ status: 403 });
    resume(); await outcome;
    expect(await store.isBlocked('a')).toBe(true);
  });
  it.each([403, 404] as const)('recusa %s recebida pelo GPS invalida consulta de entrega em voo', async status => {
    const { store } = storage(); await store.save('a', [delivery()]); const remote = api();
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let respond!: (value: Delivery) => void; const answer = new Promise<Delivery>(resolve => { respond = resolve; });
    remote.get.mockImplementationOnce(async () => { entered(); return answer; });
    const worker = service(store, remote); const reading = worker.sync.get('d1');
    const rejected = expect(reading).rejects.toMatchObject({ code: 'access_changed' });
    await started; await worker.sync.rejectAccess(status, 'd1'); respond(delivery()); await rejected;
    if (status === 403) expect(await store.isBlocked('a')).toBe(true);
    else expect(await store.get('a', 'd1')).toBeNull();
  });
  it('logout/troca de conta interrompe novas requisições e preserva a fila original', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', operation());
    const worker = service(store); worker.switchAccount('b'); await worker.sync.activate(); worker.sync.deactivate();
    expect(worker.remote.complete).not.toHaveBeenCalled(); expect(await store.pending('a')).toHaveLength(1);
    await expect(worker.sync.cachedList(true)).rejects.toMatchObject({ status: 401 });
  });
  it('uma resposta em voo confirma só a conta original e não envia a próxima pendência após sair', async () => {
    const { store } = storage(); const first = operation(); const second = operation();
    await store.save('a', [delivery(), delivery({ id: 'd2', orderId: 'o2' })]);
    await store.enqueue('a', 'd1', first); await store.enqueue('a', 'd2', second);
    let sent!: () => void; const started = new Promise<void>(resolve => { sent = resolve; });
    let respond!: (value: Delivery) => void; const answer = new Promise<Delivery>(resolve => { respond = resolve; });
    const remote = api(); remote.complete.mockImplementationOnce(async () => { sent(); return answer; });
    const worker = service(store, remote); const run = worker.sync.activate(); await started;
    worker.switchAccount('b'); worker.sync.deactivate(); respond(completed(first)); await run;
    expect(remote.complete).toHaveBeenCalledTimes(1); expect((await store.pending('a')).map(row => row.deliveryId)).toEqual(['d2']);
    expect(await store.pending('b')).toEqual([]);
  });
  it('retomar foreground envia o que ficou salvo enquanto o app estava suspenso', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', operation());
    const worker = service(store); worker.sync.setForeground(false); await worker.sync.activate();
    expect(worker.remote.complete).not.toHaveBeenCalled();
    worker.sync.setForeground(true); await worker.sync.sync(); worker.sync.deactivate();
    expect(worker.remote.complete).toHaveBeenCalledTimes(1);
  });
  it('SQLite indisponível não é apresentado como entrega concluída localmente', async () => {
    const { store, database } = storage(); await store.save('a', [delivery()]);
    database.raw.exec("CREATE TRIGGER fail_enqueue BEFORE INSERT ON courier_completions BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    const worker = service(store); worker.sync.setOnline(false);
    await expect(worker.sync.complete('d1', operation())).rejects.toMatchObject({ status: 507 });
    expect(await store.pending('a')).toEqual([]); expect(worker.remote.complete).not.toHaveBeenCalled();
  });
  it('recusa início offline mesmo com contexto salvo', async () => {
    const { store } = storage(); await store.save('a', [delivery({ status: 'ASSIGNED', orderStatus: 'READY' })]);
    const worker = service(store); worker.sync.setOnline(false);
    await expect(worker.sync.start('d1')).rejects.toMatchObject({ status: 409 }); expect(worker.remote.start).not.toHaveBeenCalled();
  });
});

describe('Modelos de tela com cache e fila reais', () => {
  it('uma página de ativas atrasada não reabre a entrega após a confirmação da fila', async () => {
    const { store } = storage(); const input = operation(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', input);
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let respond!: (value: { deliveries: Delivery[]; hasMore: boolean }) => void;
    const answer = new Promise<{ deliveries: Delivery[]; hasMore: boolean }>(resolve => { respond = resolve; });
    const remote = api(); remote.list.mockImplementationOnce(async () => { entered(); return answer; });
    const worker = service(store, remote); const request = worker.sync.list(true); await started;
    await store.acknowledge('a', input.operationId, completed(input));
    respond({ deliveries: [delivery()], hasMore: false });
    expect((await request).deliveries).toEqual([]); expect((await store.get('a', 'd1'))?.status).toBe('COMPLETED');
  });
  it('concluir enquanto a atualização de rede aguarda não deixa a tela carregando para sempre', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); const remote = api();
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let respond!: (row: Delivery) => void; const answer = new Promise<Delivery>(resolve => { respond = resolve; });
    remote.get.mockImplementationOnce(async () => { entered(); return answer; });
    const worker = service(store, remote); const model = new DeliveryDetailsModel(worker.sync, 'd1', operation);
    const reading = model.reload(); await started;
    expect(model.getSnapshot().loading).toBe(true); expect(model.getSnapshot().delivery?.fromCache).toBe(true);
    await model.complete(); expect(model.getSnapshot().loading).toBe(false);
    respond(delivery()); await reading;
    expect(model.getSnapshot().delivery?.localCompletion?.status).toBe('pending');
    expect(model.getSnapshot().loading).toBe(false);
  });
  it('reabre detalhes sem rede e permite concluir a entrega já iniciada', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); const worker = service(store); worker.sync.setOnline(false);
    const model = new DeliveryDetailsModel(worker.sync, 'd1', operation); await model.reload();
    expect(model.getSnapshot().delivery?.fromCache).toBe(true); expect(model.getSnapshot().stale).toBe(true);
    await model.complete(); expect(model.getSnapshot().delivery?.localCompletion?.status).toBe('pending');
    expect(await store.pending('a')).toHaveLength(1);
  });
  it('paginação remota mantém o offset mesmo quando uma entrega local sai da lista ativa', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); await store.enqueue('a', 'd1', operation());
    const remote = api(); remote.list.mockResolvedValue({ deliveries: [delivery(), delivery({ id: 'd2' })], hasMore: true });
    const worker = service(store, remote); const model = new DeliveriesListModel(worker.sync, true); await model.reload(); await model.loadMore();
    expect(remote.list.mock.calls[1]).toEqual([true, 2]);
    expect(model.getSnapshot().deliveries?.map(row => row.id)).toEqual(['d2']);
  });
  it('atualização local remove a entrega das ativas sem fazer uma chamada de rede extra', async () => {
    const { store } = storage(); await store.save('a', [delivery()]); const worker = service(store); worker.sync.setOnline(false);
    const model = new DeliveriesListModel(worker.sync, true); await model.reload(); await worker.sync.complete('d1', operation());
    await model.refreshLocal(); expect(model.getSnapshot().deliveries).toEqual([]); expect(worker.remote.list).not.toHaveBeenCalled();
  });
});

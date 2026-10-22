import { describe, expect, it, vi } from 'vitest';
import { DeliveriesListModel, DeliveryDetailsModel } from '../src/features/courier/models';
import { canCompleteDelivery, canStartDelivery, formatDeliveryAddress } from '../src/features/courier/presentation';
import type { DeliveriesGateway, Delivery, DeliveryCompletion, DeliveryPage } from '../src/services/deliveries.service';

const operation = { operationId: 'c809212e-c79f-4e8d-8e78-570c86be04c5', completedAt: '2026-10-22T14:30:00.000Z' };
const networkError = { status: 0, message: 'Sem conexão' };

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'd1', orderId: 'o1', courierId: 'c1', courierName: 'Yuri', status: 'ASSIGNED', orderStatus: 'READY',
    customer: { name: 'Ana', phone: '(19) 99999-8888' },
    address: { label: 'Casa', street: 'Rua Teste', number: '10', complement: 'Portão azul', district: 'Centro',
      city: 'Indaiatuba', state: 'SP', cep: '13330010', latitude: -23.088, longitude: -47.216 },
    notes: null, paymentMethod: 'CASH', total: 26, changeFor: 50,
    createdAt: '2026-10-22T14:00:00.000Z', assignedAt: '2026-10-22T14:01:00.000Z',
    startedAt: null, completedAt: null, completionReceivedAt: null, cancelledAt: null,
    ...overrides,
  };
}
const inProgress = () => delivery({ status: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY', startedAt: '2026-10-22T14:10:00.000Z' });
const completed = () => delivery({ ...inProgress(), status: 'COMPLETED', orderStatus: 'DELIVERED', completedAt: operation.completedAt, completionReceivedAt: '2026-10-22T14:30:01.000Z' });

function gateway() {
  return {
    list: vi.fn<DeliveriesGateway['list']>().mockResolvedValue({ deliveries: [delivery()], hasMore: false }),
    get: vi.fn<DeliveriesGateway['get']>().mockResolvedValue(delivery()),
    start: vi.fn<DeliveriesGateway['start']>().mockResolvedValue(inProgress()),
    complete: vi.fn<DeliveriesGateway['complete']>().mockResolvedValue(completed()),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('Lista e histórico de entregas', () => {
  it('mantém filtros independentes e ignora uma resposta depois que a tela perde o foco', async () => {
    const api = gateway(); const slow = deferred<DeliveryPage>();
    api.list.mockReturnValueOnce(slow.promise);
    const active = new DeliveriesListModel(api, true);
    const history = new DeliveriesListModel(api, false);
    const first = active.reload(); active.cancelReads();
    await history.reload();
    slow.resolve({ deliveries: [delivery({ id: 'antiga' })], hasMore: false }); await first;
    expect(api.list.mock.calls.map(call => call[0])).toEqual([true, false]);
    expect(active.getSnapshot().deliveries).toBeNull();
    expect(history.getSnapshot().deliveries?.[0].id).toBe('d1');
  });
  it('uma atualização não recebe a página antiga que ainda estava em trânsito', async () => {
    const api = gateway(); const slow = deferred<DeliveryPage>();
    api.list.mockResolvedValueOnce({ deliveries: [delivery()], hasMore: true }).mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ deliveries: [delivery({ id: 'nova' })], hasMore: false });
    const model = new DeliveriesListModel(api, true); await model.reload();
    const pagination = model.loadMore(); await model.reload();
    slow.resolve({ deliveries: [delivery({ id: 'página-antiga' })], hasMore: true }); await pagination;
    expect(model.getSnapshot().deliveries?.map(item => item.id)).toEqual(['nova']);
    expect(model.getSnapshot().hasMore).toBe(false);
  });
  it('deduplica itens sem perder a contagem do offset do servidor', async () => {
    const api = gateway();
    api.list.mockResolvedValueOnce({ deliveries: [delivery(), delivery({ id: 'd2' })], hasMore: true })
      .mockResolvedValueOnce({ deliveries: [delivery({ id: 'd2' }), delivery({ id: 'd3' })], hasMore: true })
      .mockResolvedValueOnce({ deliveries: [], hasMore: false });
    const model = new DeliveriesListModel(api, true); await model.reload(); await model.loadMore(); await model.loadMore();
    expect(model.getSnapshot().deliveries?.map(item => item.id)).toEqual(['d1', 'd2', 'd3']);
    expect(api.list.mock.calls.map(call => call[1])).toEqual([undefined, 2, 4]);
  });
  it('preserva dados com erro de conexão, mas os remove ao perder autorização', async () => {
    const api = gateway(); const model = new DeliveriesListModel(api, true); await model.reload();
    api.list.mockRejectedValueOnce(networkError); await model.reload();
    expect(model.getSnapshot().deliveries).toHaveLength(1);
    expect(model.getSnapshot().error).toBe(networkError);
    api.list.mockRejectedValueOnce({ status: 403 }); await model.reload();
    expect(model.getSnapshot().deliveries).toBeNull();
  });
  it('permite repetir a página que falhou sem apagar a lista', async () => {
    const api = gateway();
    api.list.mockResolvedValueOnce({ deliveries: [delivery()], hasMore: true }).mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ deliveries: [delivery({ id: 'd2' })], hasMore: false });
    const model = new DeliveriesListModel(api, false); await model.reload(); await model.loadMore();
    expect(model.getSnapshot().pageError).toBe(networkError);
    expect(model.getSnapshot().deliveries).toHaveLength(1);
    await model.loadMore(); expect(model.getSnapshot().deliveries).toHaveLength(2);
    expect(api.list.mock.calls.map(call => call[1])).toEqual([undefined, 1, 1]);
  });
  it('não dispara duas paginações com o mesmo offset', async () => {
    const api = gateway(); const slow = deferred<DeliveryPage>();
    api.list.mockResolvedValueOnce({ deliveries: [delivery()], hasMore: true }).mockReturnValueOnce(slow.promise);
    const model = new DeliveriesListModel(api, true); await model.reload();
    const first = model.loadMore(); await model.loadMore();
    expect(api.list).toHaveBeenCalledTimes(2);
    slow.resolve({ deliveries: [], hasMore: false }); await first;
  });
});

describe('Ações online da entrega', () => {
  it('aguarda a API para mudar estado e bloqueia toque duplicado', async () => {
    const api = gateway(); const slow = deferred<Delivery>(); api.start.mockReturnValueOnce(slow.promise);
    const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload();
    const first = model.start(); await model.start();
    expect(model.getSnapshot().delivery?.status).toBe('ASSIGNED');
    expect(model.getSnapshot().busy).toBe('start'); expect(api.start).toHaveBeenCalledTimes(1);
    slow.resolve(inProgress()); await first;
    expect(model.getSnapshot().delivery?.status).toBe('IN_PROGRESS');
  });
  it('não confirma conclusão localmente enquanto a resposta não chega', async () => {
    const api = gateway(); api.get.mockResolvedValue(inProgress()); const slow = deferred<Delivery>(); api.complete.mockReturnValueOnce(slow.promise);
    const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload();
    const first = model.complete(); await model.complete();
    expect(model.getSnapshot().delivery?.status).toBe('IN_PROGRESS'); expect(api.complete).toHaveBeenCalledTimes(1);
    slow.resolve(completed()); await first;
    expect(model.getSnapshot().delivery?.status).toBe('COMPLETED');
    expect(model.getSnapshot().pendingCompletion).toBe(false);
  });
  it('reutiliza chave e horário após timeout e exige reconciliação antes de tentar de novo', async () => {
    const api = gateway(); api.get.mockResolvedValue(inProgress());
    const createOperation = vi.fn<() => DeliveryCompletion>().mockReturnValue(operation);
    const model = new DeliveryDetailsModel(api, 'd1', createOperation); await model.reload();
    api.complete.mockRejectedValueOnce(networkError); api.get.mockRejectedValueOnce(networkError);
    await model.complete(); await model.complete();
    expect(api.complete).toHaveBeenCalledTimes(1); expect(model.getSnapshot().stale).toBe(true);
    expect(model.getSnapshot().delivery?.status).toBe('IN_PROGRESS');
    await model.reload(); await model.complete();
    expect(api.complete.mock.calls.map(call => call[1])).toEqual([operation, operation]);
    expect(createOperation).toHaveBeenCalledTimes(1);
    expect(model.getSnapshot().delivery?.status).toBe('COMPLETED');
  });
  it('reconhece conclusão confirmada no servidor após perder a resposta', async () => {
    const api = gateway(); api.get.mockResolvedValueOnce(inProgress()).mockResolvedValueOnce(completed());
    api.complete.mockRejectedValueOnce(networkError);
    const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload(); await model.complete(); await model.complete();
    expect(model.getSnapshot().delivery?.status).toBe('COMPLETED'); expect(model.getSnapshot().error).toBeNull();
    expect(api.complete).toHaveBeenCalledTimes(1);
  });
  it('reconcilia conflito/cancelamento e impede ações posteriores', async () => {
    const api = gateway(); api.get.mockResolvedValueOnce(delivery()).mockResolvedValueOnce(delivery({ status: 'CANCELLED', orderStatus: 'CANCELLED' }));
    api.start.mockRejectedValueOnce({ status: 409 });
    const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload(); await model.start(); await model.start(); await model.complete();
    expect(model.getSnapshot().delivery?.status).toBe('CANCELLED'); expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.complete).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])('retira os dados da tela ao receber HTTP %s', async status => {
    const api = gateway(); const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload();
    api.get.mockRejectedValueOnce({ status }); await model.reload();
    expect(model.getSnapshot().delivery).toBeNull();
    await model.start(); expect(api.start).not.toHaveBeenCalled();
  });
  it('troca de motoboy durante a ação não deixa endereço antigo na tela', async () => {
    const api = gateway(); const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload();
    api.start.mockRejectedValueOnce({ status: 404 }); await model.start();
    expect(model.getSnapshot().delivery).toBeNull(); expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('erro de conexão na atualização bloqueia novas ações até leitura válida', async () => {
    const api = gateway(); const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload();
    api.get.mockRejectedValueOnce(networkError); await model.reload(); await model.start();
    expect(api.start).not.toHaveBeenCalled();
    await model.reload(); await model.start(); expect(api.start).toHaveBeenCalledTimes(1);
  });
  it('uma leitura cancelada não sobrescreve o resultado de uma ação', async () => {
    const api = gateway(); const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload();
    const slow = deferred<Delivery>(); api.get.mockReturnValueOnce(slow.promise);
    const read = model.reload(); model.cancelReads(); await model.start();
    slow.resolve(delivery()); await read;
    expect(model.getSnapshot().delivery?.status).toBe('IN_PROGRESS');
  });
  it('não inicia antes de READY nem conclui entrega ainda atribuída', async () => {
    const api = gateway(); api.get.mockResolvedValue(delivery({ orderStatus: 'PREPARING' }));
    const model = new DeliveryDetailsModel(api, 'd1', () => operation); await model.reload(); await model.start(); await model.complete();
    expect(api.start).not.toHaveBeenCalled(); expect(api.complete).not.toHaveBeenCalled();
  });
  it('falha ao gerar identificador não envia conclusão nem deixa o botão ocupado', async () => {
    const api = gateway(); api.get.mockResolvedValue(inProgress());
    const model = new DeliveryDetailsModel(api, 'd1', () => { throw new Error('Crypto indisponível'); });
    await model.reload(); await model.complete();
    expect(api.complete).not.toHaveBeenCalled(); expect(model.getSnapshot().busy).toBeNull();
    expect(model.getSnapshot().error).toBeInstanceOf(Error);
  });
});

describe('Apresentação e endereço copiável', () => {
  it('preserva complemento, cidade, UF e CEP ao copiar o endereço', () => {
    expect(formatDeliveryAddress(delivery().address)).toBe('Rua Teste, 10\nPortão azul\nCentro — Indaiatuba/SP\nCEP 13330-010');
    expect(formatDeliveryAddress({ ...delivery().address, complement: null })).not.toContain('\n\n');
  });
  it('só oferece ações quando os estados de pedido e entrega são compatíveis', () => {
    expect(canStartDelivery(delivery())).toBe(true);
    expect(canStartDelivery(delivery({ orderStatus: 'CANCELLED' }))).toBe(false);
    expect(canCompleteDelivery(inProgress())).toBe(true);
    expect(canCompleteDelivery(completed())).toBe(false);
  });
});

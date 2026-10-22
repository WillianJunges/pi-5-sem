import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { distanceMeters, nearDestination, nextArrival } from '../src/features/notifications/arrivalPolicy';
import { parseDeliveryNotification, notificationForUser } from '../src/features/notifications/payload';
import { PushBindings, type DeviceGateway, type Installation } from '../src/features/notifications/pushBindings';
import { SqliteCourierStorage } from '../src/features/courier/offline/sqliteStorage';
import type { Delivery } from '../src/services/deliveries.service';
import { TestCourierDatabase } from './support/courierDatabase';
import { NotificationOpener } from '../src/features/notifications/openNotification';

const now = Date.parse('2026-10-22T15:00:00Z');
const destination = { latitude: -23.088, longitude: -47.216 };
const fix = (offset = 0) => ({ ...destination, accuracy: 10, timestamp: now + offset });
function delivery(id = 'd1'): Delivery {
  return {
    id,
    orderId: `o-${id}`,
    courierId: 'a',
    courierName: 'Yuri',
    status: 'IN_PROGRESS',
    orderStatus: 'OUT_FOR_DELIVERY',
    customer: { name: 'Teste', phone: null },
    address: {
      ...destination,
      label: null,
      street: 'Rua',
      number: '1',
      complement: null,
      district: 'Centro',
      city: 'Indaiatuba',
      state: 'SP',
      cep: '13330000',
    },
    notes: null,
    paymentMethod: 'PIX',
    total: 20,
    changeFor: null,
    createdAt: new Date(now).toISOString(),
    assignedAt: new Date(now).toISOString(),
    startedAt: new Date(now).toISOString(),
    completedAt: null,
    completionReceivedAt: null,
    cancelledAt: null,
  };
}
const databases: TestCourierDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function storage(db = new TestCourierDatabase()) {
  databases.push(db);
  return { db, store: new SqliteCourierStorage(async () => db) };
}

describe('Proximidade, precisão e ruído', () => {
  it('mede distância real e só aceita todo o círculo de precisão dentro de 100m', () => {
    expect(distanceMeters(destination, destination)).toBe(0);
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 })).toBeCloseTo(111.195, 2);
    expect(nearDestination(fix(), destination, now)).toBe(true);
    expect(nearDestination({ ...fix(), accuracy: 41 }, destination, now)).toBe(false);
    expect(nearDestination({ ...fix(), latitude: destination.latitude + 0.001 }, destination, now)).toBe(false);
    expect(nearDestination(fix(-31_000), destination, now)).toBe(false);
  });
  it('exige duas coletas separadas, ignora ordem antiga e reinicia ao sair da área', () => {
    const first = nextArrival(null, now, true, 'e1');
    const tooSoon = nextArrival(first, now + 1000, true, 'e2');
    expect(tooSoon.nearCount).toBe(1);
    const second = nextArrival(tooSoon, now + 6000, true, 'e3');
    expect(second.nearCount).toBe(2);
    expect(nextArrival(second, now - 100, true, 'e4')).toBe(second);
    expect(nextArrival(second, now + 7000, false, 'e5').nearCount).toBe(0);
    expect(nextArrival(first, now + 61_000, true, 'e6').nearCount).toBe(1);
  });
});
describe('SQLite v2 preserva fila e alerta por conta/entrega', () => {
  it('migra uma base v1 sem apagar cache ou conclusão pendente', async () => {
    const first = storage();
    await first.store.save('a', [delivery(), delivery('d2')]);
    await first.store.enqueue('a', 'd1', { operationId: randomUUID(), completedAt: new Date(now).toISOString() });
    first.db.raw.exec('DROP TABLE courier_arrivals;DROP TABLE notification_inbox;PRAGMA user_version=1;');
    const next = new SqliteCourierStorage(async () => first.db);
    expect(await next.pending('a')).toHaveLength(1);
    expect(await next.list('a')).toHaveLength(2);
    expect((await first.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(2);
  });
  it('reserva após duas coletas, evita alerta repetido e preserva estado ao reabrir o gateway', async () => {
    const { store, db } = storage();
    await store.save('a', [delivery()]);
    expect(await store.recordArrival('a', 'd1', now, true, now, randomUUID())).toBeNull();
    const claim = await store.recordArrival('a', 'd1', now + 10_000, true, now + 10_000, randomUUID());
    expect(claim).not.toBeNull();
    await store.finishArrival(claim!, true, now + 10_000);
    const reopened = new SqliteCourierStorage(async () => db);
    expect(await reopened.recordArrival('a', 'd1', now + 20_000, true, now + 20_000, randomUUID())).toBeNull();
  });
  it('falha de agendamento libera reserva e mantém mesmo eventId', async () => {
    const { store } = storage();
    await store.save('a', [delivery()]);
    await store.recordArrival('a', 'd1', now, true, now, randomUUID());
    const first = await store.recordArrival('a', 'd1', now + 10_000, true, now + 10_000, randomUUID());
    await store.finishArrival(first!, false, now + 10_000);
    const retry = await store.recordArrival('a', 'd1', now + 20_000, true, now + 20_000, randomUUID());
    expect(retry?.eventId).toBe(first?.eventId);
  });
  it('recupera lease após interrupção e ignora confirmação de lease antigo', async () => {
    const { store } = storage();
    await store.save('a', [delivery()]);
    await store.recordArrival('a', 'd1', now, true, now, randomUUID());
    const first = await store.recordArrival('a', 'd1', now + 10_000, true, now + 10_000, randomUUID());
    expect(await store.recordArrival('a', 'd1', now + 20_000, true, now + 20_000, randomUUID())).toBeNull();
    const second = await store.recordArrival('a', 'd1', now + 45_000, true, now + 45_000, randomUUID());
    expect(second).not.toBeNull();
    await store.finishArrival(first!, true, now + 45_000);
    await store.finishArrival(second!, false, now + 45_000);
    expect(await store.recordArrival('a', 'd1', now + 55_000, true, now + 55_000, randomUUID())).not.toBeNull();
  });
  it('concluir uma entrega offline não impede alerta da outra nem compartilha contas', async () => {
    const { store } = storage();
    await store.save('a', [delivery(), delivery('d2')]);
    await store.enqueue('a', 'd1', { operationId: randomUUID(), completedAt: new Date(now).toISOString() });
    for (const id of ['d1', 'd2']) await store.recordArrival('a', id, now, true, now, randomUUID());
    expect(await store.recordArrival('a', 'd1', now + 10_000, true, now + 10_000, randomUUID())).toBeNull();
    expect(await store.recordArrival('a', 'd2', now + 10_000, true, now + 10_000, randomUUID())).not.toBeNull();
    expect(await store.recordArrival('b', 'd2', now + 20_000, true, now + 20_000, randomUUID())).toBeNull();
  });
  it('deduplicação de apresentação é separada da abertura por toque', async () => {
    const { store } = storage();
    expect(await store.claimNotification('a', 'event', 'seen')).toBe(true);
    expect(await store.claimNotification('a', 'event', 'seen')).toBe(false);
    expect(await store.claimNotification('a', 'event', 'opened')).toBe(true);
    expect(await store.claimNotification('b', 'event', 'seen')).toBe(true);
  });
});

function bindings() {
  let value: Installation | null = null;
  let account: string | null = 'a';
  const gateway = {
    register: vi.fn<DeviceGateway['register']>().mockResolvedValue(undefined),
    revoke: vi.fn<DeviceGateway['revoke']>().mockResolvedValue(undefined),
  };
  const store = {
    get: async () => (value ? structuredClone(value) : null),
    set: async (next: Installation) => {
      value = structuredClone(next);
    },
  };
  const identity = () => ({ installationId: 'installation', installationKey: 'a'.repeat(64) });
  const manager = new PushBindings(store, gateway, identity, async (id) => account === id);
  return {
    manager,
    gateway,
    store,
    reopen: () => new PushBindings(store, gateway, identity, async (id) => account === id),
    switchTo: (id: string | null) => {
      account = id;
    },
  };
}
describe('Vínculo push durável por instalação', () => {
  it('registro sem rede persiste e tenta novamente ao reabrir', async () => {
    const f = bindings();
    await f.manager.enable('a', 'token', 'android');
    f.gateway.register.mockRejectedValueOnce(new Error('offline'));
    await expect(f.manager.flush()).rejects.toThrow('offline');
    expect((await f.manager.snapshot()).binding?.registered).toBe(false);
    await f.reopen().flush();
    expect((await f.manager.snapshot()).binding?.registered).toBe(true);
  });
  it('logout offline preserva revogação e uma nova conta usa versão maior', async () => {
    const f = bindings();
    await f.manager.enable('a', 'token', 'android');
    await f.manager.flush();
    await f.manager.disable();
    f.switchTo('b');
    await f.manager.enable('b', 'token', 'android');
    await f.manager.flush();
    expect(f.gateway.revoke).toHaveBeenCalledWith(expect.objectContaining({ bindingVersion: 1 }));
    expect(f.gateway.register.mock.calls[1][0]).toBe('b');
    expect(f.gateway.register.mock.calls[1][1].bindingVersion).toBeGreaterThan(1);
  });
  it('reconciliação antiga não desativa o vínculo novo', async () => {
    const f = bindings();
    f.switchTo('b');
    await f.manager.enable('b', 'token', 'android');
    await f.manager.reconcile('a');
    await f.manager.reconcile(null);
    expect((await f.manager.snapshot()).binding?.userId).toBe('b');
  });
  it('resposta de registro antigo não restaura binding após logout', async () => {
    const f = bindings();
    let release!: () => void;
    f.gateway.register.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await f.manager.enable('a', 'token', 'android');
    const sending = f.manager.flush();
    await vi.waitFor(() => expect(f.gateway.register).toHaveBeenCalledTimes(1));
    await f.manager.disable();
    f.switchTo(null);
    release();
    await sending;
    expect((await f.manager.snapshot()).binding).toBeNull();
    expect(f.gateway.revoke).toHaveBeenCalled();
  });
  it('falha de revogação mantém fila e bloqueia um registro prematuro', async () => {
    const f = bindings();
    await f.manager.enable('a', 'token', 'android');
    await f.manager.disable();
    f.switchTo('b');
    await f.manager.enable('b', 'token', 'android');
    f.gateway.revoke.mockRejectedValueOnce(new Error('offline'));
    await expect(f.manager.flush()).rejects.toThrow('offline');
    expect(f.gateway.register).not.toHaveBeenCalled();
    expect((await f.manager.snapshot()).revocations).toEqual([1]);
  });
});
describe('Payload não confiável', () => {
  it('valida identificadores e perfil sem aceitar rota arbitrária', () => {
    const p = {
      version: 1,
      eventId: randomUUID(),
      userId: randomUUID(),
      deliveryId: randomUUID(),
      orderId: randomUUID(),
      type: 'ARRIVAL',
      url: 'https://example.test',
    };
    const parsed = parseDeliveryNotification(p)!;
    expect(parsed).not.toHaveProperty('url');
    expect(notificationForUser(parsed, { id: p.userId, role: 'COURIER' })).toBe(true);
    expect(notificationForUser(parsed, { id: randomUUID(), role: 'COURIER' })).toBe(false);
    expect(notificationForUser(parsed, { id: p.userId, role: 'CUSTOMER' })).toBe(false);
    expect(parseDeliveryNotification({ ...p, deliveryId: '../../profile' })).toBeNull();
    expect(parseDeliveryNotification({ ...p, type: 'DELIVERED_AUTOMATICALLY' })).toBeNull();
  });
});

describe('Toque resolve sessão e dados atuais antes de navegar', () => {
  function opener() {
    const row = delivery(randomUUID());
    row.orderId = randomUUID();
    row.courierId = randomUUID();
    const data = {
      version: 1,
      eventId: randomUUID(),
      userId: row.courierId,
      deliveryId: row.id,
      orderId: row.orderId,
      type: 'ARRIVAL',
    };
    const deps = {
      user: { id: row.courierId, role: 'COURIER' },
      current: vi.fn(() => true),
      get: vi.fn(async () => row),
      offlineArrival: vi.fn(async () => row),
      rejected: vi.fn(async () => {}),
      claim: vi.fn(async () => true),
      navigate: vi.fn(),
    };
    return { row, data, deps, opener: new NotificationOpener(deps) };
  }
  it('abre detalhes uma vez sem concluir automaticamente', async () => {
    const f = opener();
    expect(await f.opener.open(f.data)).toBe(true);
    expect(f.deps.navigate).toHaveBeenCalledWith(f.row);
    f.deps.claim.mockResolvedValue(false);
    expect(await f.opener.open(f.data)).toBe(false);
    expect(f.deps.navigate).toHaveBeenCalledTimes(1);
  });
  it('ignora outra conta sem consultar ou abrir a entrega', async () => {
    const f = opener();
    expect(await f.opener.open({ ...f.data, userId: randomUUID() })).toBe(false);
    expect(f.deps.get).not.toHaveBeenCalled();
  });
  it('não navega se a sessão mudou enquanto a consulta estava em voo', async () => {
    const f = opener();
    f.deps.get.mockImplementation(async () => {
      f.deps.current.mockReturnValue(false);
      return f.row;
    });
    expect(await f.opener.open(f.data)).toBe(false);
    expect(f.deps.navigate).not.toHaveBeenCalled();
  });
  it('só alerta local pode abrir contexto offline; push remoto aguarda consulta online', async () => {
    const f = opener();
    f.deps.get.mockRejectedValue({ status: 0 });
    expect(await f.opener.open(f.data)).toBe(true);
    await expect(f.opener.open({ ...f.data, type: 'ASSIGNED', eventId: randomUUID() })).rejects.toMatchObject({
      status: 0,
    });
  });
  it('recusa de acesso invalida cache e não usa fallback offline', async () => {
    const f = opener();
    f.deps.get.mockRejectedValue({ status: 404 });
    await expect(f.opener.open(f.data)).rejects.toMatchObject({ status: 404 });
    expect(f.deps.rejected).toHaveBeenCalledWith(f.row.id, 404);
    expect(f.deps.offlineArrival).not.toHaveBeenCalled();
    expect(f.deps.navigate).not.toHaveBeenCalled();
  });
});

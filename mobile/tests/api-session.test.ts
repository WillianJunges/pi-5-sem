import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secure = vi.hoisted(() => ({ values: new Map<string, string>(), get: vi.fn<(key: string) => Promise<string | null>>() }));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 4,
  getItemAsync: secure.get,
  setItemAsync: async (key: string, value: string) => { secure.values.set(key, value); },
  deleteItemAsync: async (key: string) => { secure.values.delete(key); },
}));
const tokenPair = (id: string, suffix = '1') => ({ accessToken: `header.${btoa(JSON.stringify({ sub: id, role: 'COURIER' }))}.signature-${suffix}`, refreshToken: `refresh-${id}-${suffix}` });
const response = (status: number, data: unknown = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetModules(); secure.values.clear(); secure.get.mockReset(); secure.get.mockImplementation(async key => secure.values.get(key) ?? null);
});
afterEach(() => vi.unstubAllGlobals());

describe('API vinculada à conta da conclusão', () => {
  it('resposta 204 de registro de dispositivo também recusa sessão alterada', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('a'));
    vi.stubGlobal('fetch', vi.fn(async () => {
      await tokenStorage.save(tokenPair('b'));
      return new Response(null, { status: 204 });
    }));
    const { api } = await import('../src/services/api');
    await expect(api('/notifications/device', { method: 'PUT', expectedUserId: 'a' })).rejects.toMatchObject({ status: 401 });
  });
  it('não envia operação da conta A usando a sessão B', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('b'));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { api } = await import('../src/services/api');
    await expect(api('/deliveries/d1/complete', { method: 'POST', body: { operationId: 'original-a' }, expectedUserId: 'a' })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('login enquanto a leitura segura aguarda impede o envio da requisição antiga', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('a'));
    const { api } = await import('../src/services/api'); const waiting = deferred<void>(); const entered = deferred<void>();
    secure.get.mockImplementationOnce(async key => { entered.resolve(); await waiting.promise; return secure.values.get(key) ?? null; });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const request = api('/deliveries/d1/complete', { method: 'POST', expectedUserId: 'a' });
    const outcome = expect(request).rejects.toMatchObject({ status: 401 }); await entered.promise;
    const login = tokenStorage.save(tokenPair('b')); waiting.resolve(); await login; await outcome;
    expect(fetcher).not.toHaveBeenCalled(); expect(await tokenStorage.get()).toEqual(tokenPair('b'));
  });
  it('HTTP 503 no refresh preserva os tokens para sincronizar depois', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('a'));
    const fetcher = vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(503)); vi.stubGlobal('fetch', fetcher);
    const { api, onSessionExpired } = await import('../src/services/api'); const expired = vi.fn(); onSessionExpired(expired);
    await expect(api('/deliveries/d1/complete', { method: 'POST', expectedUserId: 'a' })).rejects.toMatchObject({ status: 503 });
    expect(await tokenStorage.get()).toEqual(tokenPair('a')); expect(expired).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('refresh realmente inválido encerra a sessão, sem apagar pendências SQLite', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('a'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401)));
    const { api, onSessionExpired } = await import('../src/services/api'); const expired = vi.fn(); onSessionExpired(expired);
    await expect(api('/deliveries/d1/complete', { method: 'POST', expectedUserId: 'a' })).rejects.toMatchObject({ status: 401 });
    expect(await tokenStorage.get()).toBeNull(); expect(expired).toHaveBeenCalledTimes(1);
  });
  it('resposta atrasada do refresh A não restaura A nem reenvia a operação com B', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('a'));
    const answer = deferred<Response>(); const entered = deferred<void>();
    const fetcher = vi.fn().mockResolvedValueOnce(response(401)).mockImplementationOnce(() => { entered.resolve(); return answer.promise; });
    vi.stubGlobal('fetch', fetcher); const { api } = await import('../src/services/api');
    const request = api('/deliveries/d1/complete', { method: 'POST', expectedUserId: 'a' }); const outcome = expect(request).rejects.toMatchObject({ status: 401 });
    await entered.promise; await tokenStorage.save(tokenPair('b')); answer.resolve(response(200, tokenPair('a', '2'))); await outcome;
    expect(await tokenStorage.get()).toEqual(tokenPair('b')); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('dois 401 da mesma sessão compartilham um refresh e mantêm a operação original', async () => {
    const { tokenStorage } = await import('../src/services/tokenStorage'); await tokenStorage.save(tokenPair('a'));
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return response(200, tokenPair('a', '2'));
      return (init.headers as Record<string, string>).Authorization === `Bearer ${tokenPair('a').accessToken}` ? response(401) : response(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetcher); const { api } = await import('../src/services/api');
    const options = { method: 'POST' as const, body: { operationId: 'persisted', completedAt: '2026-10-22T14:30:00.000Z' }, expectedUserId: 'a' };
    expect(await Promise.all([api('/deliveries/d1/complete', options), api('/deliveries/d1/complete', options)])).toEqual([{ ok: true }, { ok: true }]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/complete')).every(([, init]) => init.body === JSON.stringify(options.body))).toBe(true);
  });
});

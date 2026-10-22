import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessTokenUserId, createTokenStorage } from '../src/services/sessionTokens';

const tokens = (id: string, suffix = '1') => ({ accessToken: `header.${btoa(JSON.stringify({ sub: id, role: 'COURIER' }))}.signature-${suffix}`, refreshToken: `refresh-${id}-${suffix}` });
afterEach(() => vi.unstubAllGlobals());
function secureStore() {
  const values = new Map<string, string>();
  return { values, getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); } };
}

describe('Tokens seguros e isolamento de sessão', () => {
  it('lê os tokens legados e migra o par para uma única chave segura', async () => {
    const secure = secureStore(); const storage = createTokenStorage(secure); const old = tokens('a');
    secure.values.set('auth.accessToken', old.accessToken); secure.values.set('auth.refreshToken', old.refreshToken);
    expect(await storage.get()).toEqual(old);
    await storage.save(tokens('a', '2'));
    expect(secure.values.has('auth.accessToken')).toBe(false); expect(secure.values.has('auth.refreshToken')).toBe(false);
    expect(await storage.get()).toEqual(tokens('a', '2'));
  });
  it('um logout não ressuscita tokens antigos mesmo se a limpeza de chaves legadas falhar', async () => {
    const secure = secureStore(); const old = tokens('a');
    secure.values.set('auth.accessToken', old.accessToken); secure.values.set('auth.refreshToken', old.refreshToken);
    const storage = createTokenStorage({ ...secure, deleteItemAsync: async () => { throw new Error('cleanup failure'); } });
    await storage.clear(); expect(await storage.get()).toBeNull();
    expect(secure.values.get('auth.tokens')).toBe('null');
  });
  it('refresh atrasado não substitui os tokens de um novo login', async () => {
    const storage = createTokenStorage(secureStore()); const old = tokens('a'); await storage.save(old);
    await storage.save(tokens('b'));
    expect(await storage.replaceIfCurrent(old, tokens('a', '2'))).toBe(false);
    expect(await storage.get()).toEqual(tokens('b'));
  });
  it('refresh atrasado não restaura tokens depois de sair', async () => {
    const storage = createTokenStorage(secureStore()); const old = tokens('a'); await storage.save(old); await storage.clear();
    expect(await storage.replaceIfCurrent(old, tokens('a', '2'))).toBe(false); expect(await storage.get()).toBeNull();
  });
  it('renova a mesma conta sem trocar a geração da sessão e recusa outra identidade', async () => {
    const storage = createTokenStorage(secureStore()); const old = tokens('a'); await storage.save(old); const epoch = storage.getSessionEpoch();
    expect(await storage.replaceIfCurrent(old, tokens('b'))).toBe(false);
    expect(await storage.replaceIfCurrent(old, tokens('a', '2'))).toBe(true);
    expect(storage.getSessionEpoch()).toBe(epoch);
  });
  it('login/logout invalidam requisições já iniciadas antes de persistir suas mudanças', async () => {
    const storage = createTokenStorage(secureStore()); const saving = storage.save(tokens('a'));
    expect(storage.getSessionEpoch()).toBe(1); await saving;
    const clearing = storage.clear(); expect(storage.getSessionEpoch()).toBe(2); await clearing;
  });
  it('identifica o usuário local sem aceitar payload malformado como conta válida', () => {
    expect(accessTokenUserId(tokens('a').accessToken)).toBe('a');
    expect(accessTokenUserId('invalid')).toBeNull(); expect(accessTokenUserId('header.bad-base64.signature')).toBeNull();
  });
  it('a identificação da sessão funciona em runtime sem atob do navegador', () => {
    const token = tokens('a').accessToken;
    vi.stubGlobal('atob', undefined);
    expect(accessTokenUserId(token)).toBe('a');
  });
  it('par JSON corrompido exige novo login sem ressuscitar credenciais legadas', async () => {
    const secure = secureStore(); const old = tokens('a');
    secure.values.set('auth.tokens', '{invalid'); secure.values.set('auth.accessToken', old.accessToken); secure.values.set('auth.refreshToken', old.refreshToken);
    expect(await createTokenStorage(secure).get()).toBeNull();
  });
});

import { toByteArray } from 'base64-js';

export interface Tokens { accessToken: string; refreshToken: string }
interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Só identifica a conta local; a assinatura e a autorização continuam no backend. */
export function accessTokenUserId(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    // Hermes não precisa oferecer o atob do navegador para este fluxo funcionar.
    const bytes = toByteArray(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const json = decodeURIComponent(Array.from(bytes, byte => `%${byte.toString(16).padStart(2, '0')}`).join(''));
    const value = JSON.parse(json);
    return typeof value.sub === 'string' ? value.sub : null;
  } catch { return null; }
}

/** Serializa o par de tokens para refresh/login/logout não misturarem duas contas. */
export function createTokenStorage(storage: SecureKeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  let epoch = 0;
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
  const read = async (): Promise<Tokens | null> => {
    const saved = await storage.getItemAsync('auth.tokens');
    if (saved !== null) {
      try {
        const tokens = JSON.parse(saved) as Tokens | null;
        return typeof tokens?.accessToken === 'string' && typeof tokens.refreshToken === 'string'
          && tokens.accessToken && tokens.refreshToken ? tokens : null;
      } catch { return null; } // Reautenticar é seguro; reutilizar chaves antigas não é.
    }
    // Compatibilidade com sessões gravadas antes da fila offline.
    const [accessToken, refreshToken] = await Promise.all([
      storage.getItemAsync('auth.accessToken'), storage.getItemAsync('auth.refreshToken'),
    ]);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  };
  const write = async (tokens: Tokens | null) => {
    // Uma única chave evita par incompleto se o processo morrer entre duas gravações.
    // O tombstone "null" impede ressuscitar tokens legados após logout.
    await storage.setItemAsync('auth.tokens', JSON.stringify(tokens));
    await Promise.allSettled([storage.deleteItemAsync('auth.accessToken'), storage.deleteItemAsync('auth.refreshToken')]);
  };
  return {
    get: () => serial(read),
    getSessionEpoch: () => epoch,
    save(tokens: Tokens) { ++epoch; return serial(() => write(tokens)); },
    clear() { ++epoch; return serial(() => write(null)); },
    /** Um refresh antigo nunca pode restaurar a sessão depois de logout ou outro login. */
    replaceIfCurrent(expected: Tokens, replacement: Tokens | null): Promise<boolean> {
      return serial(async () => {
        const current = await read();
        if (current?.refreshToken !== expected.refreshToken || current.accessToken !== expected.accessToken) return false;
        if (replacement && accessTokenUserId(replacement.accessToken) !== accessTokenUserId(current.accessToken)) return false;
        await write(replacement);
        return true;
      });
    },
  };
}

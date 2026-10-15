import { API_URL } from '../config/env';
import { tokenStorage, type Tokens } from './tokenStorage';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Envia o access token (padrão: true). Use false nas rotas públicas. */
  auth?: boolean;
}

let sessionExpiredListener: (() => void) | null = null;

/** Chamado quando não é mais possível renovar a sessão (usuário precisa logar de novo). */
export function onSessionExpired(listener: (() => void) | null) {
  sessionExpiredListener = listener;
}

async function send(path: string, { method = 'GET', body, auth = true }: RequestOptions, accessToken?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Evita disparar vários refresh ao mesmo tempo quando várias requisições recebem 401.
let refreshing: Promise<Tokens | null> | null = null;

function refreshTokens(): Promise<Tokens | null> {
  refreshing ??= (async () => {
    const current = await tokenStorage.get();
    if (!current) return null;

    const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken: current.refreshToken }, auth: false });
    if (!res.ok) {
      await tokenStorage.clear();
      return null;
    }

    const data = (await res.json()) as Tokens;
    const tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    await tokenStorage.save(tokens);
    return tokens;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Faz uma requisição para a API. Se o access token tiver expirado (401),
 * renova a sessão automaticamente e tenta de novo uma vez.
 */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  const tokens = auth ? await tokenStorage.get() : null;

  let res = await send(path, options, tokens?.accessToken);

  if (res.status === 401 && auth && tokens) {
    const renewed = await refreshTokens();
    if (!renewed) {
      sessionExpiredListener?.();
      throw new ApiError('Sessão expirada. Faça login novamente.', 401);
    }
    res = await send(path, options, renewed.accessToken);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = (data as { error?: string } | undefined)?.error ?? 'Erro na comunicação com o servidor';
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

import { API_URL } from '../config/env';
import { tokenStorage, type Tokens } from './tokenStorage';
import { accessTokenUserId } from './sessionTokens';

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
  /** A fila do motoboy só pode enviar operações com a conta que as criou. */
  expectedUserId?: string;
}

/** Tempo máximo de espera por uma resposta da API. */
const REQUEST_TIMEOUT_MS = 10_000;

let sessionExpiredListener: (() => void) | null = null;

/** Chamado quando não é mais possível renovar a sessão (usuário precisa logar de novo). */
export function onSessionExpired(listener: (() => void) | null) {
  sessionExpiredListener = listener;
}

async function send(path: string, { method = 'GET', body, auth = true }: RequestOptions, accessToken?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Sem resposta em REQUEST_TIMEOUT_MS, cancela a requisição para o app não ficar girando.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // status 0 = nenhuma resposta do servidor (tempo esgotado ou sem conexão).
    throw controller.signal.aborted
      ? new ApiError('O servidor demorou para responder. Tente novamente.', 0)
      : new ApiError('Não foi possível conectar ao servidor. Verifique sua internet.', 0);
  } finally {
    clearTimeout(timer);
  }
}

// Evita disparar vários refresh ao mesmo tempo quando várias requisições recebem 401.
let refreshing: { token: string; promise: Promise<Tokens | null> } | null = null;

function refreshTokens(expected: Tokens): Promise<Tokens | null> {
  if (refreshing?.token === expected.refreshToken) return refreshing.promise;
  const promise = (async () => {
    const current = await tokenStorage.get();
    if (!current) throw sessionChanged();
    if (current.refreshToken !== expected.refreshToken) {
      if (accessTokenUserId(current.accessToken) === accessTokenUserId(expected.accessToken)) return current;
      throw sessionChanged();
    }

    const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken: current.refreshToken }, auth: false });
    if (!res.ok) {
      if (res.status !== 401 && res.status !== 403) throw new ApiError('Não foi possível renovar a sessão agora. Tente novamente.', res.status);
      if (!await tokenStorage.replaceIfCurrent(current, null)) throw sessionChanged();
      return null;
    }

    const data = (await res.json()) as Tokens;
    const tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    if (!await tokenStorage.replaceIfCurrent(current, tokens)) throw sessionChanged();
    return tokens;
  })().finally(() => {
    if (refreshing?.token === expected.refreshToken) refreshing = null;
  });
  refreshing = { token: expected.refreshToken, promise };
  return promise;
}

/**
 * Faz uma requisição para a API. Se o access token tiver expirado (401),
 * renova a sessão automaticamente e tenta de novo uma vez.
 */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  const epoch = tokenStorage.getSessionEpoch();
  const tokens = auth ? await tokenStorage.get() : null;
  const checkSession = (value: Tokens | null) => {
    if (auth && epoch !== tokenStorage.getSessionEpoch()) throw sessionChanged();
    if (options.expectedUserId && (!value || accessTokenUserId(value.accessToken) !== options.expectedUserId)) throw sessionChanged();
  };
  checkSession(tokens);

  let res = await send(path, options, tokens?.accessToken);

  if (res.status === 401 && auth && tokens) {
    checkSession(tokens);
    const renewed = await refreshTokens(tokens);
    if (!renewed) {
      if (epoch !== tokenStorage.getSessionEpoch()) throw sessionChanged();
      sessionExpiredListener?.();
      throw new ApiError('Sessão expirada. Faça login novamente.', 401);
    }
    checkSession(renewed);
    res = await send(path, options, renewed.accessToken);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => undefined);
  checkSession(tokens);
  if (!res.ok) {
    const message = (data as { error?: string } | undefined)?.error ?? 'Erro na comunicação com o servidor';
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

function sessionChanged() { return new ApiError('A sessão mudou. Tente novamente com a conta atual.', 401); }

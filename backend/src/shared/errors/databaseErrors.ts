import { AppError } from './AppError';

/**
 * Converte erros lançados pelas procedures/triggers (SIGNAL) e violações de
 * restrição do MySQL em AppError com o status HTTP adequado.
 *
 *   errno 5401 (SIGNAL ... MYSQL_ERRNO = 5401) → 401 sessão inválida
 *   errno 5404 (SIGNAL ... MYSQL_ERRNO = 5404) → 404 registro não encontrado
 *   errno 1062 (duplicidade)                     → 409
 *   errno 1644 (SIGNAL SQLSTATE '45000')        → 400 dado inválido
 *
 * Erros desconhecidos são devolvidos sem alteração (viram 500 no errorHandler).
 */
const STATUS_BY_ERRNO: Record<number, number> = {
  5401: 401,
  5404: 404,
  1062: 409,
  1644: 400,
};

export function translateDatabaseError(err: unknown): unknown {
  const dbError = err as { errno?: number; sqlMessage?: string };
  const status = dbError.errno ? STATUS_BY_ERRNO[dbError.errno] : undefined;

  if (!status) return err;
  // Duplicidade vinda de índice UNIQUE traz mensagem técnica; a da procedure já é amigável.
  const message =
    dbError.errno === 1062 && dbError.sqlMessage?.includes('uq_users_single_owner')
      ? 'Já existe uma conta de proprietária no sistema.'
      : dbError.errno === 1062 && dbError.sqlMessage?.startsWith('Duplicate') ? 'Registro duplicado' : dbError.sqlMessage;
  return new AppError(message ?? 'Erro no banco de dados', status);
}

/**
 * Códigos que o mysql2 usa quando não consegue falar com o banco (MySQL desligado,
 * host errado, rede caída, conexão derrubada no meio da consulta, limite de conexões).
 */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
]);

/** Indica que o erro foi falta de conexão com o banco (não um erro de SQL ou de regra). */
export function isDatabaseUnavailable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code && UNAVAILABLE_CODES.has(code)) return true;
  // Falhas de conexão em paralelo podem chegar agrupadas (AggregateError).
  const errors = (err as { errors?: unknown[] } | null)?.errors;
  return Array.isArray(errors) && errors.length > 0 && errors.every(isDatabaseUnavailable);
}

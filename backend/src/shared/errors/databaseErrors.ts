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
    dbError.errno === 1062 && dbError.sqlMessage?.startsWith('Duplicate') ? 'Registro duplicado' : dbError.sqlMessage;
  return new AppError(message ?? 'Erro no banco de dados', status);
}

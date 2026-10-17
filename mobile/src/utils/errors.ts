import { ApiError } from '../services/api';

/** Converte qualquer erro em uma mensagem para mostrar ao usuário. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const issues = (err.data as { issues?: { message: string }[] } | undefined)?.issues;
    return issues?.[0]?.message ?? err.message;
  }
  if (err instanceof TypeError) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.';
  }
  return 'Algo deu errado. Tente novamente.';
}

/**
 * Falta de conexão (sem internet, servidor sem responder ou banco fora do ar),
 * em vez de um erro de verdade. Nesses casos a tela pode usar a cópia salva.
 */
export function isConnectionError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0 || err.status === 503;
  return err instanceof TypeError;
}

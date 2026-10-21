import type { Role } from '../users/user.types';

/** LOGIN_LOCKED: tentativa de entrar com a conta bloqueada por senhas erradas (script 023). */
export type AccessLogEvent = 'REGISTER' | 'LOGIN' | 'LOGIN_FAILED' | 'LOGIN_LOCKED' | 'LOGOUT';

/**
 * Documento da coleção access_logs (MongoDB).
 *
 * DESNORMALIZADO de propósito: em vez de guardar só o user_id (como faria uma tabela
 * relacional com chave estrangeira), cada documento carrega uma CÓPIA dos dados do
 * usuário naquele momento. Assim o histórico é lido sem JOIN e continua correto mesmo
 * se o usuário mudar de nome, e-mail ou perfil depois.
 */
export interface AccessLog {
  event: AccessLogEvent;
  success: boolean;
  /** E-mail digitado (existe mesmo quando o login falha e o usuário não é encontrado). */
  email: string;
  /** Cópia do usuário no momento do evento (null se o e-mail não existir). */
  user: { id: string; name: string; email: string; role: Role } | null;
  device: { ip: string | null; userAgent: string | null };
  createdAt: Date;
}

/** Informações da requisição repassadas pelo controller. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

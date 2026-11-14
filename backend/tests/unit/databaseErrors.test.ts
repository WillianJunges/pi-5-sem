import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/shared/errors/AppError';
import { isDatabaseUnavailable, translateDatabaseError } from '../../src/shared/errors/databaseErrors';

describe('banco indisponível', () => {
  it('reconhece falhas de conexão do mysql2', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR']) {
      expect(isDatabaseUnavailable(Object.assign(new Error(code), { code }))).toBe(true);
    }
  });

  it('reconhece falhas agrupadas (AggregateError)', () => {
    const refused = Object.assign(new Error(), { code: 'ECONNREFUSED' });
    expect(isDatabaseUnavailable(new AggregateError([refused, refused]))).toBe(true);
  });

  it('não confunde com erros de SQL, de regra ou desconhecidos', () => {
    expect(isDatabaseUnavailable(Object.assign(new Error(), { code: 'ER_PARSE_ERROR', errno: 1064 }))).toBe(false);
    expect(isDatabaseUnavailable(new AppError('Pedido não encontrado', 404))).toBe(false);
    expect(isDatabaseUnavailable(new Error('qualquer coisa'))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
  });

  it('erro de conexão continua sem tradução (vira 503 no errorHandler)', () => {
    const refused = Object.assign(new Error(), { code: 'ECONNREFUSED' });
    expect(translateDatabaseError(refused)).toBe(refused);
  });
});

describe('limite de proprietária', () => {
  it('traduz a violação do índice de proprietária em conflito compreensível', () => {
    const error = translateDatabaseError({ errno: 1062, sqlMessage: "Duplicate entry '1' for key 'users.uq_users_single_owner'" });
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 409, message: 'Já existe uma conta de proprietária no sistema.' });
  });

  it('mantém a mensagem genérica para outras duplicidades', () => {
    const error = translateDatabaseError({ errno: 1062, sqlMessage: "Duplicate entry 'a' for key 'users.uq_users_email'" });
    expect(error).toMatchObject({ statusCode: 409, message: 'Registro duplicado' });
  });
});

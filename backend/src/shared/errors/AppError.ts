/**
 * Erro "esperado" da aplicação (regra de negócio, validação, permissão...).
 * Qualquer camada pode lançar; o errorHandler converte em resposta HTTP.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

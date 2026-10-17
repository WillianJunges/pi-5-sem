import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { isDatabaseUnavailable } from '../errors/databaseErrors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dados inválidos',
      issues: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }

  // Banco fora do ar: 503 avisa o app que é temporário (pode tentar de novo).
  if (isDatabaseUnavailable(err)) {
    console.error(`[banco indisponível] ${(err as { code?: string }).code ?? 'sem conexão'}`);
    return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

import { Router } from 'express';
import { checkDatabaseConnection } from './config/database';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  const database = (await checkDatabaseConnection()) ? 'ok' : 'error';
  res.status(database === 'ok' ? 200 : 503).json({ status: 'ok', database });
});

// Cada módulo registra suas rotas aqui, ex.:
// routes.use('/auth', authRoutes);

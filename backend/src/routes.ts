import { Router } from 'express';
import { checkDatabaseConnection } from './config/database';
import { authRoutes } from './modules/auth/auth.routes';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  const database = (await checkDatabaseConnection()) ? 'ok' : 'error';
  res.status(database === 'ok' ? 200 : 503).json({ status: 'ok', database });
});

routes.use('/auth', authRoutes);

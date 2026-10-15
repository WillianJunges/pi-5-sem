import { Router } from 'express';
import { checkDatabaseConnection } from './config/database';
import { checkMongoConnection } from './config/mongo';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  const [mysqlOk, mongodb] = await Promise.all([checkDatabaseConnection(), checkMongoConnection()]);
  const database = mysqlOk ? 'ok' : 'error';
  res.status(database === 'ok' ? 200 : 503).json({ status: 'ok', database, mongodb });
});

routes.use('/auth', authRoutes);
routes.use('/users', usersRoutes);

// Rotas de cada módulo, protegidas por perfil. Exemplo:
// routes.use('/owner', authenticate, authorize('OWNER'), ownerRoutes);
// routes.use('/courier', authenticate, authorize('COURIER'), courierRoutes);

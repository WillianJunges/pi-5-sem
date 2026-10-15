import { Router } from 'express';
import { checkDatabaseConnection } from './config/database';
import { checkMongoConnection } from './config/mongo';
import { addressesRoutes } from './modules/addresses/addresses.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { geoRoutes } from './modules/geo/geo.routes';
import { usersRoutes } from './modules/users/users.routes';
import { authenticate } from './shared/middlewares/authenticate';
import { authorize } from './shared/middlewares/authorize';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  const [mysqlOk, mongodb] = await Promise.all([checkDatabaseConnection(), checkMongoConnection()]);
  const database = mysqlOk ? 'ok' : 'error';
  res.status(database === 'ok' ? 200 : 503).json({ status: 'ok', database, mongodb });
});

routes.use('/auth', authRoutes);
routes.use('/users', usersRoutes);
routes.use('/geo', geoRoutes);

// Cliente
routes.use('/addresses', authenticate, authorize('CUSTOMER'), addressesRoutes);

// Rotas de cada módulo, protegidas por perfil. Exemplo:
// routes.use('/owner', authenticate, authorize('OWNER'), ownerRoutes);
// routes.use('/courier', authenticate, authorize('COURIER'), courierRoutes);

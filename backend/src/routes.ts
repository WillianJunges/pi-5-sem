import { Router } from 'express';
import { checkDatabaseConnection } from './config/database';
import { checkMongoConnection } from './config/mongo';
import { addressesRoutes } from './modules/addresses/addresses.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { geoRoutes } from './modules/geo/geo.routes';
import { menusRoutes } from './modules/menus/menus.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { ownerRoutes } from './modules/owner/owner.routes';
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
routes.use('/menus', menusRoutes); // público: cardápio do dia

// Cliente
routes.use('/addresses', authenticate, authorize('CUSTOMER'), addressesRoutes);
routes.use('/orders', authenticate, authorize('CUSTOMER'), ordersRoutes);

// Proprietária (Lucas): produtos, cardápios e taxas de entrega
routes.use('/owner', authenticate, authorize('OWNER'), ownerRoutes);

// Rotas de cada módulo, protegidas por perfil. Exemplo:
// routes.use('/courier', authenticate, authorize('COURIER'), courierRoutes);
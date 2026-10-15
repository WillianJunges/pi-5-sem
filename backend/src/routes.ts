import { Router } from 'express';
import { checkDatabaseConnection } from './config/database';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  const database = (await checkDatabaseConnection()) ? 'ok' : 'error';
  res.status(database === 'ok' ? 200 : 503).json({ status: 'ok', database });
});

routes.use('/auth', authRoutes);
routes.use('/users', usersRoutes);

// Rotas de cada módulo, protegidas por perfil. Exemplo:
// routes.use('/owner', authenticate, authorize('OWNER'), ownerRoutes);
// routes.use('/courier', authenticate, authorize('COURIER'), courierRoutes);

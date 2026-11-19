import { Router } from 'express';
import { customerExtrasRoutes } from '../customer-extras/customerExtras.routes';
import { ordersController } from './orders.controller';

/** Montado em routes.ts com authenticate + authorize('CUSTOMER'). */
export const ordersRoutes = Router();
ordersRoutes.use(customerExtrasRoutes);

ordersRoutes.get('/', ordersController.list);
ordersRoutes.post('/quote', ordersController.quote);
ordersRoutes.post('/', ordersController.create);
ordersRoutes.get('/:id', ordersController.get);
ordersRoutes.post('/:id/cancel', ordersController.cancel);

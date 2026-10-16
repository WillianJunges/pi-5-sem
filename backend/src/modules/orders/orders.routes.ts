import { Router } from 'express';
import { ordersController } from './orders.controller';

/** Montado em routes.ts com authenticate + authorize('CUSTOMER'). */
export const ordersRoutes = Router();

ordersRoutes.post('/', ordersController.create);
ordersRoutes.get('/:id', ordersController.get);

import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { deliveriesController } from './deliveries.controller';

export const deliveriesRoutes = Router();
deliveriesRoutes.use(authenticate);
// Rotas fixas vêm antes de /:id para não interpretar "me" como UUID.
deliveriesRoutes.get('/me', authorize('COURIER'), deliveriesController.list);
deliveriesRoutes.get('/order/:id', deliveriesController.forOrder);
deliveriesRoutes.get('/:id', deliveriesController.get);
deliveriesRoutes.patch('/:id/start', authorize('COURIER'), deliveriesController.start);
deliveriesRoutes.post('/:id/complete', authorize('COURIER'), deliveriesController.complete);

/** O Router da proprietária já exige authenticate + authorize('OWNER'). */
export const ownerDeliveriesRoutes = Router();
ownerDeliveriesRoutes.post('/:id/assign', deliveriesController.assign);

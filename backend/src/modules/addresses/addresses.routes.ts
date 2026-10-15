import { Router } from 'express';
import { addressesController } from './addresses.controller';

/** Montado em routes.ts com authenticate + authorize('CUSTOMER'). */
export const addressesRoutes = Router();

addressesRoutes.get('/', addressesController.list);
addressesRoutes.post('/', addressesController.create);
addressesRoutes.get('/:id', addressesController.get);
addressesRoutes.put('/:id', addressesController.update);
addressesRoutes.patch('/:id/default', addressesController.setDefault);
addressesRoutes.delete('/:id', addressesController.delete);

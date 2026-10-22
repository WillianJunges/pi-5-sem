import { Router } from 'express';
import { ownerDeliveriesRoutes } from '../deliveries/deliveries.routes';
import { couriersController } from '../couriers/couriers.controller';
import { deliveryFeesController } from '../delivery-fees/deliveryFees.controller';
import { menusController } from '../menus/menus.controller';
import { ownerOrdersController } from '../owner-orders/ownerOrders.controller';
import { productsController } from '../products/products.controller';

/**
 * Rotas administrativas da Proprietária (Lucas).
 * Montadas em routes.ts com `authenticate, authorize('OWNER')`.
 */
export const ownerRoutes = Router();
ownerRoutes.use('/deliveries', ownerDeliveriesRoutes);

// Produtos e variações (escopo, seção 7)
ownerRoutes.get('/products', productsController.list);
ownerRoutes.post('/products', productsController.create);
ownerRoutes.get('/products/:id', productsController.get);
ownerRoutes.put('/products/:id', productsController.update);
ownerRoutes.patch('/products/:id/active', productsController.setActive);
ownerRoutes.delete('/products/:id', productsController.remove);
ownerRoutes.post('/products/:id/variants', productsController.addVariant);
ownerRoutes.put('/variants/:id', productsController.updateVariant);
ownerRoutes.patch('/variants/:id/active', productsController.setVariantActive);
ownerRoutes.delete('/variants/:id', productsController.removeVariant);

// Cardápios (escopo, seção 8)
ownerRoutes.get('/menus', menusController.list);
ownerRoutes.post('/menus', menusController.create);
ownerRoutes.get('/menus/:id', menusController.get);
ownerRoutes.put('/menus/:id', menusController.update);
ownerRoutes.delete('/menus/:id', menusController.remove);
ownerRoutes.post('/menus/:id/activate', menusController.activate);
ownerRoutes.post('/menus/:id/close', menusController.close);
ownerRoutes.post('/menus/:id/items', menusController.addItem);
ownerRoutes.patch('/menus/:id/items/:itemId', menusController.setSpecialPrice);
ownerRoutes.delete('/menus/:id/items/:itemId', menusController.removeItem);

// Faixas de distância e taxas de entrega (escopo, seção 19)
ownerRoutes.get('/delivery-fees', deliveryFeesController.list);
ownerRoutes.get('/delivery-fees/quote', deliveryFeesController.quote);
ownerRoutes.post('/delivery-fees', deliveryFeesController.create);
ownerRoutes.put('/delivery-fees/:id', deliveryFeesController.update);
ownerRoutes.delete('/delivery-fees/:id', deliveryFeesController.remove);

// Administração de pedidos (escopo, seção 11)
ownerRoutes.get('/orders', ownerOrdersController.list);
ownerRoutes.get('/orders/:id', ownerOrdersController.get);
ownerRoutes.post('/orders/:id/confirm', ownerOrdersController.confirm);
ownerRoutes.post('/orders/:id/prepare', ownerOrdersController.prepare);
ownerRoutes.post('/orders/:id/ready', ownerOrdersController.ready);
ownerRoutes.post('/orders/:id/pickup', ownerOrdersController.pickup);
ownerRoutes.post('/orders/:id/cancel', ownerOrdersController.cancel);

// Motoboys (escopo, seção 3)
ownerRoutes.get('/couriers', couriersController.list);
ownerRoutes.post('/couriers', couriersController.create);
ownerRoutes.get('/couriers/:id', couriersController.get);
ownerRoutes.put('/couriers/:id', couriersController.update);
ownerRoutes.patch('/couriers/:id/active', couriersController.setActive);

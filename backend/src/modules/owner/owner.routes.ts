import { Router } from 'express';
import { deliveryFeesController } from '../delivery-fees/deliveryFees.controller';
import { menusController } from '../menus/menus.controller';
import { productsController } from '../products/products.controller';

/**
 * Rotas administrativas da Proprietária (Lucas).
 * Montadas em routes.ts com `authenticate, authorize('OWNER')`.
 */
export const ownerRoutes = Router();

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

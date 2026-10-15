import { Router } from 'express';
import { menusController } from './menus.controller';

/** Rotas públicas de cardápio (sem login): o cliente consulta o cardápio do dia. */
export const menusRoutes = Router();

menusRoutes.get('/today', menusController.today);

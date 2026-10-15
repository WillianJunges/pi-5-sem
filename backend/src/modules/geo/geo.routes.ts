import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { geoController } from './geo.controller';

export const geoRoutes = Router();

// exige login (qualquer perfil) para ninguém usar a API como proxy gratuito de mapas
geoRoutes.get('/cep/:cep', authenticate, geoController.cep);
geoRoutes.get('/search', authenticate, geoController.search);

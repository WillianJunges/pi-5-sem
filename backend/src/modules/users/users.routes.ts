import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { usersController } from './users.controller';

export const usersRoutes = Router();

usersRoutes.get('/me', authenticate, usersController.me);

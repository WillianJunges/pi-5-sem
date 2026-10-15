import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { usersController } from './users.controller';

export const usersRoutes = Router();

usersRoutes.get('/me', authenticate, usersController.me);
usersRoutes.get('/me/access-logs', authenticate, usersController.myAccessLogs);
usersRoutes.get('/', authenticate, authorize('OWNER'), usersController.list);

import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { devicesRepository } from './devices.repository';
import { registerDeviceSchema, revokeDeviceSchema } from './notifications.schemas';

export const notificationsRoutes = Router();
notificationsRoutes.put('/device', authenticate, async (req, res) => {
  await devicesRepository.register(req.user!, registerDeviceSchema.parse(req.body));
  res.status(204).end();
});
notificationsRoutes.post('/device/revoke', async (req, res) => {
  await devicesRepository.revoke(revokeDeviceSchema.parse(req.body));
  res.status(204).end();
});

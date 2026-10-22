import { createServer } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { attachTracking } from './modules/tracking/tracking.socket';
import { startNotificationsWorker } from './modules/notifications/notifications.worker';

// REST e Socket.IO compartilham a mesma porta e a mesma autenticação.
const server = createServer(app);
attachTracking(server);
const stopNotifications=startNotificationsWorker();
server.once('close',stopNotifications);

server.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});

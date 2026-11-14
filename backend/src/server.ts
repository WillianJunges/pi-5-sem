import { createServer } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { attachTracking } from './modules/tracking/tracking.socket';
import { startNotificationsWorker } from './modules/notifications/notifications.worker';
import { menusService } from './modules/menus/menus.service';

// REST e Socket.IO compartilham a mesma porta e a mesma autenticação.
const server = createServer(app);
attachTracking(server);
const stopNotifications=startNotificationsWorker();
server.once('close',stopNotifications);
// Também sincroniza ao iniciar; solicitações sincronizam novamente caso o servidor estivesse desligado.
const syncMenus = () => void menusService.expirePreviousDays().catch(err => console.error('[menus] sincronização diária:', err));
syncMenus();
const menuTimer = setInterval(syncMenus, 60_000);
server.once('close', () => clearInterval(menuTimer));

server.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});

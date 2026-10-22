import { createServer } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { attachTracking } from './modules/tracking/tracking.socket';

// REST e Socket.IO compartilham a mesma porta e a mesma autenticação.
const server = createServer(app);
attachTracking(server);

server.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});

import { createServer } from 'node:http';
import { app } from './app';
import { env } from './config/env';

// Servidor HTTP explícito para que o Socket.IO (rastreamento) possa ser acoplado depois.
const server = createServer(app);

server.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});

import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { verifyAccessToken } from '../auth/tokens';
import { AppError } from '../../shared/errors/AppError';
import { trackingRepository } from './tracking.repository';
import { ZodError } from 'zod';
import { trackingId } from './tracking.schemas';
import { trackingEvents } from './tracking.events';

/** Um canal por conexão; autoriza entrada E cada emissão, inclusive após expiração do JWT. */
export function attachTracking(server: HttpServer) {
  const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 4096 });
  const deliveryBySocket = new Map<string, string>();
  const pending = new Set<string>();
  const actor = (socket: Socket) => {
    try {
      const p = verifyAccessToken(socket.handshake.auth.token);
      return { id: p.sub, role: p.role };
    } catch { throw new AppError('Sessão expirada. Reconecte para continuar.', 401); }
  };
  const failure = (error: unknown) => ({ status: error instanceof AppError ? error.statusCode : error instanceof ZodError ? 400 : 503,
    message: error instanceof AppError ? error.message : 'Não foi possível atualizar a posição.' });
  io.use((socket, next) => { try { actor(socket); next(); } catch { next(new Error('Sessão inválida')); } });

  async function refresh(socket: Socket) {
    const id = deliveryBySocket.get(socket.id);
    if (!id || pending.has(socket.id)) return;
    pending.add(socket.id);
    try {
      const result = await trackingRepository.read(id, actor(socket));
      if (socket.connected && deliveryBySocket.get(socket.id) === id) socket.emit('delivery:location', result);
      if (!result.active) { deliveryBySocket.delete(socket.id); void socket.leave(`delivery:${id}`); }
    } catch (error) {
      socket.emit('tracking:error', { deliveryId: id, ...failure(error) });
      deliveryBySocket.delete(socket.id);
      void socket.leave(`delivery:${id}`);
    } finally { pending.delete(socket.id); }
  }
  io.on('connection', socket => {
    socket.on('delivery:subscribe', async (value: unknown, ack?: (value: unknown) => void) => {
      if (typeof ack !== 'function') return;
      try {
        const id = trackingId.parse(value);
        const previous = deliveryBySocket.get(socket.id);
        if (previous) { deliveryBySocket.delete(socket.id); await socket.leave(`delivery:${previous}`); }
        const result = await trackingRepository.read(id, actor(socket));
        if (socket.connected && result.active) { deliveryBySocket.set(socket.id, id); await socket.join(`delivery:${id}`); }
        ack({ ok: true, data: result });
      } catch (error) { ack({ ok: false, ...failure(error) }); }
    });
    socket.on('delivery:unsubscribe', () => {
      const id = deliveryBySocket.get(socket.id); deliveryBySocket.delete(socket.id);
      if (id) void socket.leave(`delivery:${id}`);
    });
    socket.on('disconnect', () => { deliveryBySocket.delete(socket.id); });
  });
  const unsubscribe = trackingEvents.subscribe(id => {
    for (const socket of io.sockets.sockets.values()) if (deliveryBySocket.get(socket.id) === id) void refresh(socket);
  });
  // Revalida contas, conclusão e token mesmo se o GPS parar de enviar posições.
  const timer = setInterval(() => { for (const socket of io.sockets.sockets.values()) void refresh(socket); }, 5000);
  timer.unref();
  server.once('close', () => { clearInterval(timer); unsubscribe(); });
  return io;
}

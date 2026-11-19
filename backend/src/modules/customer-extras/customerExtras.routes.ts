import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { db } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { idParam } from '../../shared/utils/params';

export const estimateRoutes = Router();
estimateRoutes.get('/', async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>('SELECT estimated_minutes AS estimatedMinutes FROM store_preferences WHERE id = 1');
  res.json({ estimatedMinutes: rows[0]?.estimatedMinutes ?? 60 });
});

export const customerExtrasRoutes = Router();
customerExtrasRoutes.get('/:id/extras', async (req, res) => {
  const id = idParam(req);
  const [orders] = await db.query<RowDataPacket[]>('SELECT receipt_confirmed_at, estimated_minutes, created_at, status, fulfillment FROM orders WHERE id = ? AND customer_id = ?', [id, req.user!.id]);
  if (!orders[0]) throw new AppError('Pedido não encontrado', 404);
  const [reviews] = await db.query<RowDataPacket[]>('SELECT rating, comment FROM order_reviews WHERE order_id = ?', [id]);
  const [requests] = await db.query<RowDataPacket[]>('SELECT id, category, description, status, created_at AS createdAt FROM support_requests WHERE order_id = ? ORDER BY created_at DESC', [id]);
  const o = orders[0];
  res.json({ estimatedMinutes: o.estimated_minutes, receiptConfirmedAt: o.receipt_confirmed_at, review: reviews[0] ?? null, requests });
});
customerExtrasRoutes.post('/:id/receipt', async (req, res) => {
  const [result] = await db.query<ResultSetHeader>("UPDATE orders SET receipt_confirmed_at = COALESCE(receipt_confirmed_at, UTC_TIMESTAMP()) WHERE id = ? AND customer_id = ? AND status = 'DELIVERED' AND fulfillment = 'DELIVERY'", [idParam(req), req.user!.id]);
  if (!result.affectedRows) throw new AppError('Confirmação disponível após a entrega.', 409);
  res.json({ ok: true });
});
customerExtrasRoutes.put('/:id/review', async (req, res) => {
  const data = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).nullish() }).parse(req.body);
  const id = idParam(req);
  const [orders] = await db.query<RowDataPacket[]>("SELECT id FROM orders WHERE id = ? AND customer_id = ? AND status = 'DELIVERED'", [id, req.user!.id]);
  if (!orders.length) throw new AppError('Avaliação disponível após a conclusão do pedido.', 409);
  await db.query('INSERT INTO order_reviews (order_id, rating, comment) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)', [id, data.rating, data.comment || null]);
  res.json({ ok: true });
});
customerExtrasRoutes.post('/:id/support', async (req, res) => {
  const data = z.object({ category: z.enum(['MISSING', 'WRONG', 'OTHER']), description: z.string().trim().min(3).max(1000) }).parse(req.body);
  const id = idParam(req);
  const [orders] = await db.query<RowDataPacket[]>('SELECT id FROM orders WHERE id = ? AND customer_id = ?', [id, req.user!.id]);
  if (!orders.length) throw new AppError('Pedido não encontrado', 404);
  await db.query('INSERT INTO support_requests (id, order_id, category, description) VALUES (?, ?, ?, ?)', [randomUUID(), id, data.category, data.description]);
  res.status(201).json({ ok: true });
});

export const ownerExtrasRoutes = Router();
ownerExtrasRoutes.get('/preferences', async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>('SELECT estimated_minutes AS estimatedMinutes FROM store_preferences WHERE id = 1');
  res.json({ estimatedMinutes: rows[0]?.estimatedMinutes ?? 60 });
});
ownerExtrasRoutes.put('/preferences', async (req, res) => {
  const data = z.object({ estimatedMinutes: z.number().int().min(1).max(1440) }).parse(req.body);
  await db.query('UPDATE store_preferences SET estimated_minutes = ? WHERE id = 1', [data.estimatedMinutes]);
  res.json(data);
});
ownerExtrasRoutes.get('/reviews', async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT r.order_id AS orderId, r.rating, r.comment, u.name AS customerName FROM order_reviews r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = o.customer_id ORDER BY r.created_at DESC LIMIT 200`);
  res.json(rows);
});
ownerExtrasRoutes.get('/support', async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT s.id, s.order_id AS orderId, s.category, s.description, s.status, s.created_at AS createdAt, u.name AS customerName, u.phone AS customerPhone FROM support_requests s JOIN orders o ON o.id = s.order_id JOIN users u ON u.id = o.customer_id ORDER BY s.status = 'OPEN' DESC, s.created_at DESC LIMIT 200`);
  res.json(rows);
});
ownerExtrasRoutes.patch('/support/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['OPEN', 'RESOLVED']) }).parse(req.body);
  const [result] = await db.query<ResultSetHeader>("UPDATE support_requests SET status = ?, resolved_at = IF(? = 'RESOLVED', UTC_TIMESTAMP(), NULL) WHERE id = ?", [status, status, idParam(req)]);
  if (!result.affectedRows) throw new AppError('Solicitação não encontrada', 404);
  res.json({ ok: true });
});
ownerExtrasRoutes.patch('/menus/:id/items/:itemId/availability', async (req, res) => {
  const { availability } = z.object({ availability: z.enum(['AVAILABLE', 'LOW', 'SOLD_OUT']) }).parse(req.body);
  const itemId = z.uuid().parse(req.params.itemId);
  const [result] = await db.query<ResultSetHeader>("UPDATE menu_items mi JOIN menus m ON m.id = mi.menu_id SET mi.availability = ? WHERE mi.id = ? AND mi.menu_id = ? AND m.status <> 'CLOSED'", [availability, itemId, idParam(req)]);
  if (!result.affectedRows) throw new AppError('Item não encontrado ou cardápio encerrado', 404);
  res.json({ ok: true });
});

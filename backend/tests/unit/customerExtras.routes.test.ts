import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../src/config/database', () => ({ db: { query } }));
import { customerExtrasRoutes } from '../../src/modules/customer-extras/customerExtras.routes';

const orderId = '6f1c2a10-0000-4000-8000-000000000001';
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: 'customer-1', role: 'CUSTOMER' } as typeof req.user; next(); });
app.use('/orders', customerExtrasRoutes);
app.use((error: { statusCode?: number; status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? error.status ?? 500).json({ error: error.message }));

describe('customer order extras', () => {
  beforeEach(() => query.mockReset());
  it('only confirms a completed delivery belonging to the customer', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const response = await request(app).post(`/orders/${orderId}/receipt`).send({});
    expect(response.status).toBe(409);
    expect(query.mock.calls[0][1]).toEqual([orderId, 'customer-1']);
    expect(query.mock.calls[0][0]).toContain("status = 'DELIVERED'");
  });
  it("does not permit a review of another customer order", async () => {
    query.mockResolvedValueOnce([[]]);
    const response = await request(app).put(`/orders/${orderId}/review`).send({ rating: 5 });
    expect(response.status).toBe(409);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('validates support request descriptions before accessing the database', async () => {
    const response = await request(app).post(`/orders/${orderId}/support`).send({ category: 'OTHER', description: '' });
    expect(response.status).not.toBe(200);
    expect(query).not.toHaveBeenCalled();
  });
});

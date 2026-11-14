import type { Request, Response } from 'express';
import { idParam } from '../../shared/utils/params';
import { toOrderResponse, toSummaryResponse } from '../orders/orders.controller';
import { cancelOrderSchema } from '../orders/orders.schemas';
import { ownerOrdersQuerySchema, reportQuerySchema } from './ownerOrders.schemas';
import { ownerOrdersService } from './ownerOrders.service';
import type { OwnerAction, OwnerOrder } from './ownerOrders.types';

/** Pedido como a proprietária recebe: valores em reais e os dados do cliente. */
const toOwnerOrderResponse = ({ customer, ...order }: OwnerOrder) => ({ ...toOrderResponse(order), customer });

const action = (name: OwnerAction) => async (req: Request, res: Response) => {
  res.json(toOwnerOrderResponse(await ownerOrdersService.apply(idParam(req), name)));
};

export const ownerOrdersController = {
  async dashboard(req: Request, res: Response) {
    const { period } = reportQuerySchema.parse(req.query);
    res.json(await ownerOrdersService.dashboard(period));
  },
  /** GET /owner/orders — pedidos de todos os clientes, mais novos primeiro. */
  async list(req: Request, res: Response) {
    const { orders, hasMore } = await ownerOrdersService.list(ownerOrdersQuerySchema.parse(req.query));
    res.json({
      orders: orders.map(({ customer, ...summary }) => ({ ...toSummaryResponse(summary), customer })),
      hasMore,
    });
  },

  /** GET /owner/orders/:id — pedido completo. */
  async get(req: Request, res: Response) {
    res.json(toOwnerOrderResponse(await ownerOrdersService.get(idParam(req))));
  },

  confirm: action('confirm'),
  prepare: action('prepare'),
  ready: action('ready'),
  pickup: action('pickup'),
  async cancel(req: Request, res: Response) {
    const { reason } = cancelOrderSchema.parse(req.body ?? {});
    res.json(toOwnerOrderResponse(await ownerOrdersService.apply(idParam(req), 'cancel', reason)));
  },
};

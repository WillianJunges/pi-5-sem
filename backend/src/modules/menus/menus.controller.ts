import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { idParam } from '../../shared/utils/params';
import { addItemSchema, listQuerySchema, menuSchema, presentItem, presentMenu, presentMenuDetail, specialPriceSchema } from './menus.schemas';
import { menusService } from './menus.service';

export const menusController = {
  /** Público: cardápio do dia para o app do cliente. */
  async today(_req: Request, res: Response) {
    const menu = await menusService.getToday();
    if (!menu) throw new AppError('Nenhum cardápio disponível hoje', 404);
    res.json(menu);
  },

  async list(req: Request, res: Response) {
    const { status } = listQuerySchema.parse(req.query);
    res.json((await menusService.list(status)).map(presentMenu));
  },

  async get(req: Request, res: Response) {
    res.json(presentMenuDetail(await menusService.get(idParam(req))));
  },

  async create(req: Request, res: Response) {
    res.status(201).json(presentMenu(await menusService.create(menuSchema.parse(req.body))));
  },

  async update(req: Request, res: Response) {
    res.json(presentMenu(await menusService.update(idParam(req), menuSchema.parse(req.body))));
  },

  async remove(req: Request, res: Response) {
    await menusService.remove(idParam(req));
    res.status(204).end();
  },

  async activate(req: Request, res: Response) {
    res.json(presentMenu(await menusService.activate(idParam(req))));
  },

  async prepareWeekly(req: Request, res: Response) {
    res.status(201).json(presentMenu(await menusService.prepareWeekly(idParam(req))));
  },

  async duplicate(req: Request, res: Response) {
    res.status(201).json(presentMenu(await menusService.duplicate(idParam(req))));
  },

  async close(req: Request, res: Response) {
    res.json(presentMenu(await menusService.close(idParam(req))));
  },

  async addItem(req: Request, res: Response) {
    const { variantId, specialPrice } = addItemSchema.parse(req.body);
    res.status(201).json(presentItem(await menusService.addItem(idParam(req), variantId, specialPrice)));
  },

  async setSpecialPrice(req: Request, res: Response) {
    const { specialPrice } = specialPriceSchema.parse(req.body);
    res.json(presentItem(await menusService.setSpecialPrice(idParam(req), idParam(req, 'itemId'), specialPrice)));
  },

  async removeItem(req: Request, res: Response) {
    await menusService.removeItem(idParam(req), idParam(req, 'itemId'));
    res.status(204).end();
  },
};

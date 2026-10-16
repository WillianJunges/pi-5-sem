import type { Request, Response } from 'express';
import { idParam } from '../../shared/utils/params';
import { activeSchema, createProductSchema, presentProduct, presentVariant, productSchema, variantSchema } from './products.schemas';
import { productsService } from './products.service';

const toVariantData = (v: { name: string; price: number }) => ({ name: v.name, priceCents: v.price });

export const productsController = {
  async list(_req: Request, res: Response) {
    res.json((await productsService.list(true)).map(presentProduct));
  },

  async get(req: Request, res: Response) {
    res.json(presentProduct(await productsService.get(idParam(req))));
  },

  async create(req: Request, res: Response) {
    const data = createProductSchema.parse(req.body);
    const product = await productsService.create({ ...data, variants: data.variants.map(toVariantData) });
    res.status(201).json(presentProduct(product));
  },

  async update(req: Request, res: Response) {
    res.json(presentProduct(await productsService.update(idParam(req), productSchema.parse(req.body))));
  },

  async setActive(req: Request, res: Response) {
    const { active } = activeSchema.parse(req.body);
    res.json(presentProduct(await productsService.setActive(idParam(req), active)));
  },

  async remove(req: Request, res: Response) {
    await productsService.remove(idParam(req));
    res.status(204).end();
  },

  async addVariant(req: Request, res: Response) {
    const variant = await productsService.addVariant(idParam(req), toVariantData(variantSchema.parse(req.body)));
    res.status(201).json(presentVariant(variant));
  },

  async updateVariant(req: Request, res: Response) {
    const variant = await productsService.updateVariant(idParam(req), toVariantData(variantSchema.parse(req.body)));
    res.json(presentVariant(variant));
  },

  async setVariantActive(req: Request, res: Response) {
    const { active } = activeSchema.parse(req.body);
    res.json(presentVariant(await productsService.setVariantActive(idParam(req), active)));
  },

  async removeVariant(req: Request, res: Response) {
    await productsService.removeVariant(idParam(req));
    res.status(204).end();
  },
};

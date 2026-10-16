import { AppError } from '../../shared/errors/AppError';
import type { Product, ProductData, ProductVariant, VariantData } from './product.types';
import { type ProductsRepository, productsRepository } from './products.repository';

const sameName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;

/** Avisado quando o catálogo muda (o cardápio do dia precisa ser atualizado). */
export type CatalogChangeListener = () => Promise<void>;

/**
 * Catálogo: produtos e variações (tamanhos), cada variação com seu preço padrão
 * (escopo, seção 7). Os dados chegam já validados pelos schemas (zod) do controller;
 * aqui ficam as regras que dependem do que está gravado.
 */
export class ProductsService {
  private listeners: CatalogChangeListener[] = [];

  constructor(private readonly repo: ProductsRepository) {}

  onChange(listener: CatalogChangeListener) {
    this.listeners.push(listener);
  }

  private async changed() {
    for (const listener of this.listeners) await listener();
  }

  /** A proprietária vê também os desativados. */
  list(includeInactive = true): Promise<Product[]> {
    return this.repo.list(includeInactive);
  }

  async get(id: string): Promise<Product> {
    const product = await this.repo.findById(id);
    if (!product) throw new AppError('Produto não encontrado', 404);
    return product;
  }

  async create(data: ProductData & { variants: VariantData[] }): Promise<Product> {
    data.variants.forEach((v, i) => {
      if (data.variants.findIndex((o) => sameName(o.name, v.name)) !== i) {
        throw new AppError(`A variação "${v.name}" foi informada mais de uma vez`, 400);
      }
    });
    await this.ensureUniqueName(data.name);
    return this.repo.create(data);
  }

  async update(id: string, data: ProductData): Promise<Product> {
    await this.get(id);
    await this.ensureUniqueName(data.name, id);
    await this.repo.update(id, data);
    await this.changed();
    return this.get(id);
  }

  async setActive(id: string, active: boolean): Promise<Product> {
    const product = await this.get(id);
    if (active && !product.variants.some((v) => v.active)) {
      throw new AppError('Ative ao menos uma variação antes de ativar o produto', 409);
    }
    await this.repo.setActive(id, active);
    await this.changed();
    return this.get(id);
  }

  /** Produto já usado em pedido não é excluído (preserva o histórico): deve ser desativado. */
  async remove(id: string): Promise<void> {
    await this.get(id);
    if (await this.repo.isProductUsedInOrders(id)) {
      throw new AppError('Este produto já aparece em pedidos e não pode ser excluído. Desative-o', 409);
    }
    if (await this.repo.isProductInAnyMenu(id)) {
      throw new AppError('Este produto está em um cardápio. Retire-o dos cardápios ou desative-o', 409);
    }
    await this.repo.delete(id);
  }

  async addVariant(productId: string, data: VariantData): Promise<ProductVariant> {
    const product = await this.get(productId);
    this.ensureUniqueVariantName(product, data.name);
    return this.repo.addVariant(productId, data);
  }

  /** Muda nome e/ou preço padrão. Pedidos antigos guardam o preço da época e não mudam. */
  async updateVariant(variantId: string, data: VariantData): Promise<ProductVariant> {
    const { product } = await this.getVariant(variantId);
    this.ensureUniqueVariantName(product, data.name, variantId);
    await this.repo.updateVariant(variantId, data);
    await this.changed();
    return (await this.repo.findVariantById(variantId))!;
  }

  async setVariantActive(variantId: string, active: boolean): Promise<ProductVariant> {
    const { product } = await this.getVariant(variantId);
    if (!active && product.active && !product.variants.some((v) => v.id !== variantId && v.active)) {
      throw new AppError('Esta é a única variação ativa. Para tirá-la de venda, desative o produto', 409);
    }
    await this.repo.setVariantActive(variantId, active);
    await this.changed();
    return (await this.repo.findVariantById(variantId))!;
  }

  async removeVariant(variantId: string): Promise<void> {
    const { product } = await this.getVariant(variantId);
    if (product.variants.length === 1) {
      throw new AppError('O produto precisa ter ao menos uma variação. Exclua ou desative o produto', 409);
    }
    if (await this.repo.isVariantUsedInOrders(variantId)) {
      throw new AppError('Esta variação já aparece em pedidos e não pode ser excluída. Desative-a', 409);
    }
    if (await this.repo.isVariantInAnyMenu(variantId)) {
      throw new AppError('Esta variação está em um cardápio. Retire-a dos cardápios ou desative-a', 409);
    }
    if (product.active && !product.variants.some((v) => v.id !== variantId && v.active)) {
      throw new AppError('Esta é a única variação ativa. Ative outra antes de excluir esta', 409);
    }
    await this.repo.deleteVariant(variantId);
  }

  private async getVariant(variantId: string) {
    const variant = await this.repo.findVariantById(variantId);
    if (!variant) throw new AppError('Variação não encontrada', 404);
    return { variant, product: await this.get(variant.productId) };
  }

  private async ensureUniqueName(name: string, ignoreId?: string) {
    const existing = await this.repo.findByName(name);
    if (existing && existing.id !== ignoreId) {
      throw new AppError(`Já existe um produto chamado "${existing.name}"`, 409);
    }
  }

  private ensureUniqueVariantName(product: Product, name: string, ignoreId?: string) {
    if (product.variants.some((v) => v.id !== ignoreId && sameName(v.name, name))) {
      throw new AppError(`O produto já tem uma variação chamada "${name}"`, 409);
    }
  }
}

export const productsService = new ProductsService(productsRepository);

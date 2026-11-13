import { AppError } from '../../shared/errors/AppError';
import { todayISODate } from '../../shared/utils/date';
import { fromCents } from '../../shared/utils/money';
import { type ProductsRepository, productsRepository } from '../products/products.repository';
import { productsService } from '../products/products.service';
import type { Menu, MenuDetail, MenuItem, MenuItemDetail, MenuStatus, PublicMenu, PublicMenuProduct } from './menu.types';
import { type MenuSnapshotsRepository, menuSnapshotsRepository } from './menuSnapshots.repository';
import { type MenusRepository, menusRepository } from './menus.repository';

const STATUS_LABEL: Record<MenuStatus, string> = { DRAFT: 'rascunho', ACTIVE: 'ativo', CLOSED: 'encerrado' };

/** Regra do escopo (seção 8): existe preço especial? usa ele; senão, o preço padrão. */
export function effectivePrice(standardPriceCents: number, specialPriceCents: number | null): number {
  return specialPriceCents ?? standardPriceCents;
}

/**
 * Monta o cardápio que o cliente vê: só itens disponíveis, agrupados por produto,
 * com o preço que vale em reais.
 */
export function toPublicMenu(menu: Pick<Menu, 'id' | 'menuDate' | 'status'>, items: MenuItemDetail[]): PublicMenu {
  const products = new Map<string, PublicMenuProduct>();
  for (const item of items.filter((i) => i.available)) {
    let product = products.get(item.productId);
    if (!product) {
      product = {
        productId: item.productId,
        name: item.productName,
        description: item.productDescription,
        category: item.category,
        price: Number.POSITIVE_INFINITY,
        variations: [],
      };
      products.set(item.productId, product);
    }
    const price = fromCents(item.effectivePriceCents);
    product.variations.push({
      variantId: item.variantId,
      name: item.variantName,
      price,
      standardPrice: fromCents(item.standardPriceCents),
    });
    product.price = Math.min(product.price, price);
  }
  for (const p of products.values()) p.variations.sort((a, b) => a.price - b.price);
  return { menuId: menu.id, date: menu.menuDate, status: menu.status, items: [...products.values()] };
}

/**
 * Cardápios: escolhem, do catálogo, o que está à venda em um dia (escopo, seção 8).
 * Ciclo DRAFT → ACTIVE → CLOSED; só um cardápio ativo por vez.
 * Sempre que o cardápio ativo muda, a cópia no MongoDB é atualizada.
 */
export class MenusService {
  constructor(
    private readonly menus: MenusRepository,
    private readonly products: ProductsRepository,
    private readonly snapshots: MenuSnapshotsRepository,
    private readonly today: () => string = () => todayISODate(),
  ) {}

  list(status?: MenuStatus): Promise<Menu[]> {
    return this.menus.list(status);
  }

  /** Cardápio com nomes e preços, para a tela da proprietária. */
  async get(id: string): Promise<MenuDetail> {
    const menu = await this.find(id);
    return { ...menu, items: await this.menus.itemDetails(id) };
  }

  /**
   * Cardápio do dia para o cliente (GET /menus/today): o cardápio ATIVO cuja data é hoje.
   * Lê a cópia do MongoDB; se não houver, monta a partir do MySQL.
   */
  async getToday(): Promise<PublicMenu | null> {
    const today = this.today();
    try {
      const snapshot = await this.snapshots.findActiveByDate(today);
      if (snapshot) return snapshot;
    } catch (err) {
      console.warn('[menus] MongoDB indisponível, lendo do MySQL:', (err as Error).message);
    }
    const active = await this.menus.findActive();
    if (!active || active.menuDate !== today) return null;
    return toPublicMenu(active, await this.menus.itemDetails(active.id));
  }

  /**
   * Preço que vale para uma variação no pedido, segundo o cardápio do dia, em centavos.
   * Para o módulo de pedidos: o backend nunca confia no preço vindo do app.
   */
  async priceForOrder(variantId: string): Promise<number> {
    const active = await this.menus.findActive();
    if (active && active.menuDate === this.today()) {
      const item = (await this.menus.itemDetails(active.id)).find((i) => i.variantId === variantId && i.available);
      if (item) return item.effectivePriceCents;
    }
    throw new AppError('Este item não está disponível no cardápio de hoje', 409);
  }

  async create(data: { name: string; menuDate: string; weekday?: number | null }): Promise<Menu> {
    await this.ensureWeekdayAvailable(data.weekday);
    return this.menus.create(data);
  }

  async update(id: string, data: { name: string; menuDate: string; weekday?: number | null }): Promise<Menu> {
    const menu = await this.find(id);
    this.ensureEditable(menu);
    if (menu.status === 'ACTIVE') throw new AppError('Encerre o cardápio antes de alterar seus dados', 409);
    const updated = { ...data, weekday: data.weekday === undefined ? menu.weekday : data.weekday };
    await this.ensureWeekdayAvailable(updated.weekday, id);
    await this.menus.update(id, updated);
    await this.publishIfActive(menu);
    return this.find(id);
  }

  /** Só rascunhos podem ser excluídos; os demais ficam como histórico. */
  async remove(id: string): Promise<void> {
    const menu = await this.find(id);
    if (menu.status !== 'DRAFT') {
      throw new AppError(`Só é possível excluir cardápios em rascunho. Este está ${STATUS_LABEL[menu.status]}`, 409);
    }
    await this.menus.delete(id);
  }

  async addItem(menuId: string, variantId: string, specialPriceCents: number | null): Promise<MenuItem> {
    const menu = await this.find(menuId);
    this.ensureEditable(menu);
    const variant = await this.products.findVariantById(variantId);
    if (!variant) throw new AppError('Variação não encontrada', 404);
    const product = (await this.products.findById(variant.productId))!;
    if (!product.active || !variant.active) {
      throw new AppError(`"${product.name} ${variant.name}" está desativado e não pode entrar no cardápio`, 409);
    }
    if (menu.items.some((i) => i.variantId === variantId)) {
      throw new AppError(`"${product.name} ${variant.name}" já está neste cardápio`, 409);
    }
    const item = await this.menus.addItem(menuId, variantId, specialPriceCents);
    await this.publishIfActive(menu);
    return item;
  }

  /** Define ou remove (null) o preço especial. O preço padrão não muda. */
  async setSpecialPrice(menuId: string, itemId: string, specialPriceCents: number | null): Promise<MenuItem> {
    const menu = await this.find(menuId);
    this.ensureEditable(menu);
    const item = this.findItem(menu, itemId);
    await this.menus.updateItemSpecialPrice(itemId, specialPriceCents);
    await this.publishIfActive(menu);
    return { ...item, specialPriceCents };
  }

  async removeItem(menuId: string, itemId: string): Promise<void> {
    const menu = await this.find(menuId);
    this.ensureEditable(menu);
    this.findItem(menu, itemId);
    if (menu.status === 'ACTIVE' && menu.items.length === 1) {
      throw new AppError('Um cardápio ativo não pode ficar vazio. Encerre o cardápio', 409);
    }
    await this.menus.removeItem(itemId);
    await this.publishIfActive(menu);
  }

  /** Publica o cardápio para os clientes. A procedure sp_activate_menu confere de novo, com bloqueio. */
  async activate(id: string): Promise<Menu> {
    const menu = await this.find(id);
    if (menu.weekday != null) throw new AppError('Prepare o cardápio de hoje a partir do modelo semanal', 409);
    if (menu.menuDate !== this.today()) throw new AppError('Só é possível ativar o cardápio no próprio dia', 409);
    if (menu.status !== 'DRAFT') {
      throw new AppError(`Só cardápios em rascunho podem ser ativados. Este está ${STATUS_LABEL[menu.status]}`, 409);
    }
    const items = await this.menus.itemDetails(id);
    if (items.length === 0) throw new AppError('Adicione ao menos um item antes de ativar o cardápio', 409);
    const unavailable = items.filter((i) => !i.available);
    if (unavailable.length > 0) {
      const names = unavailable.map((i) => `${i.productName} ${i.variantName}`).join(', ');
      throw new AppError(`Itens desativados no cardápio: ${names}. Retire-os ou reative-os`, 409);
    }
    let active = await this.menus.findActive();
    if (active && active.menuDate < this.today()) {
      await this.menus.close(active.id);
      await this.safely(() => this.snapshots.markClosed(active!.id));
      active = await this.menus.findActive();
    }
    if (active) {
      throw new AppError(`O cardápio "${active.name}" ainda está ativo. Encerre-o antes de ativar outro`, 409);
    }
    await this.menus.activate(id);
    const activated = await this.find(id);
    await this.publishIfActive(activated);
    return activated;
  }

  async prepareWeekly(id: string): Promise<Menu> {
    const template = await this.find(id);
    if (template.weekday == null || template.status !== 'DRAFT') throw new AppError('Modelo semanal não encontrado', 404);
    const today = this.today();
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    if (template.weekday !== weekday) throw new AppError('Este modelo não corresponde ao dia de hoje', 409);
    if (!this.menus.prepareWeekly) throw new AppError('Operação indisponível', 500);
    return this.menus.prepareWeekly(id, today);
  }

  async close(id: string): Promise<Menu> {
    const menu = await this.find(id);
    if (menu.status !== 'ACTIVE') {
      throw new AppError(`Só cardápios ativos podem ser encerrados. Este está ${STATUS_LABEL[menu.status]}`, 409);
    }
    await this.menus.close(id);
    await this.safely(() => this.snapshots.markClosed(id));
    return this.find(id);
  }

  /** Atualiza a cópia do MongoDB do cardápio ativo (chamado também quando o catálogo muda). */
  async refreshActiveSnapshot(): Promise<void> {
    const active = await this.menus.findActive();
    if (active) await this.publishIfActive(active);
  }

  private async publishIfActive(menu: Menu) {
    if (menu.status !== 'ACTIVE') return;
    const fresh = await this.find(menu.id);
    const items = await this.menus.itemDetails(menu.id);
    await this.safely(() => this.snapshots.save(toPublicMenu(fresh, items)));
  }

  /** Falha no MongoDB não pode derrubar a operação principal (docs/banco-nao-relacional.md). */
  private async safely(action: () => Promise<void>) {
    try {
      await action();
    } catch (err) {
      console.warn('[menus] não foi possível atualizar a cópia no MongoDB:', (err as Error).message);
    }
  }

  private async find(id: string): Promise<Menu> {
    const menu = await this.menus.findById(id);
    if (!menu) throw new AppError('Cardápio não encontrado', 404);
    return menu;
  }

  private ensureEditable(menu: Menu) {
    if (menu.status === 'CLOSED') throw new AppError('Cardápios encerrados não podem ser alterados', 409);
  }

  private async ensureWeekdayAvailable(weekday?: number | null, exceptId?: string) {
    if (weekday == null) return;
    if ((await this.menus.list()).some((menu) => menu.weekday === weekday && menu.id !== exceptId)) {
      throw new AppError('Já existe um modelo para esse dia da semana. Edite o modelo existente.', 409);
    }
  }

  private findItem(menu: Menu, itemId: string): MenuItem {
    const item = menu.items.find((i) => i.id === itemId);
    if (!item) throw new AppError('Item não encontrado neste cardápio', 404);
    return item;
  }
}

export const menusService = new MenusService(menusRepository, productsRepository, menuSnapshotsRepository);

// Produto desativado, preço alterado etc. → o cardápio do dia do cliente reflete na hora.
productsService.onChange(() => menusService.refreshActiveSnapshot());

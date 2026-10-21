import { randomUUID } from 'node:crypto';
import type { DeliveryFeeRange, FeeRangeData } from '../../src/modules/delivery-fees/deliveryFee.types';
import type { DeliveryFeesRepository } from '../../src/modules/delivery-fees/deliveryFees.repository';
import type { Menu, MenuItem, MenuItemDetail, MenuStatus, PublicMenu } from '../../src/modules/menus/menu.types';
import type { MenuSnapshotsRepository } from '../../src/modules/menus/menuSnapshots.repository';
import type { MenusRepository } from '../../src/modules/menus/menus.repository';
import { effectivePrice } from '../../src/modules/menus/menus.service';
import type { Product, ProductData, ProductVariant, VariantData } from '../../src/modules/products/product.types';
import type { ProductsRepository } from '../../src/modules/products/products.repository';
import type { AccessLog } from '../../src/modules/access-logs/accessLog.types';
import type { AccessLogsRepository } from '../../src/modules/access-logs/accessLogs.repository';
import type { PasswordReset, PasswordResetsRepository } from '../../src/modules/auth/passwordResets.repository';
import type { RefreshToken, RefreshTokensRepository } from '../../src/modules/auth/refreshTokens.repository';
import type { CreateUserData, LoginFailure, Role, User, UserSummary } from '../../src/modules/users/user.types';
import type { UsersRepository } from '../../src/modules/users/users.repository';

/**
 * Repositórios em memória para os testes unitários: as regras de negócio são testadas
 * sem precisar de MySQL. Os testes de integração usam os repositórios reais.
 */

const sameName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;

type ProductRow = Omit<Product, 'variants'>;
type MenuRow = Omit<Menu, 'items'>;

/** "Banco" compartilhado, para produtos e cardápios enxergarem um ao outro. */
export class MemoryStore {
  products: ProductRow[] = [];
  variants: ProductVariant[] = [];
  menus: MenuRow[] = [];
  items: MenuItem[] = [];
  /** Variações que aparecem em pedidos (a tabela é do módulo do Cliente). */
  variantsInOrders = new Set<string>();
}

export class MemoryProductsRepository implements ProductsRepository {
  constructor(private readonly db: MemoryStore) {}

  private assemble(row: ProductRow): Product {
    return {
      ...row,
      variants: this.db.variants
        .filter((v) => v.productId === row.id)
        .sort((a, b) => a.priceCents - b.priceCents)
        .map((v) => ({ ...v })),
    };
  }

  async list(includeInactive: boolean) {
    return this.db.products
      .filter((p) => includeInactive || p.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((p) => {
        const product = this.assemble(p);
        if (!includeInactive) product.variants = product.variants.filter((v) => v.active);
        return product;
      });
  }

  async findById(id: string) {
    const row = this.db.products.find((p) => p.id === id);
    return row ? this.assemble(row) : null;
  }

  async findByName(name: string) {
    const row = this.db.products.find((p) => sameName(p.name, name));
    return row ? this.assemble(row) : null;
  }

  async create(data: ProductData & { variants: VariantData[] }) {
    const row: ProductRow = { id: randomUUID(), ...data, active: true };
    this.db.products.push(row);
    for (const v of data.variants) await this.addVariant(row.id, v);
    return this.assemble(row);
  }

  async update(id: string, data: ProductData) {
    Object.assign(this.db.products.find((p) => p.id === id)!, data);
  }

  async setActive(id: string, active: boolean) {
    this.db.products.find((p) => p.id === id)!.active = active;
  }

  async delete(id: string) {
    this.db.products = this.db.products.filter((p) => p.id !== id);
    this.db.variants = this.db.variants.filter((v) => v.productId !== id);
  }

  async findVariantById(id: string) {
    const v = this.db.variants.find((x) => x.id === id);
    return v ? { ...v } : null;
  }

  async addVariant(productId: string, data: VariantData) {
    const v: ProductVariant = { id: randomUUID(), productId, ...data, active: true };
    this.db.variants.push(v);
    return { ...v };
  }

  async updateVariant(id: string, data: VariantData) {
    Object.assign(this.db.variants.find((v) => v.id === id)!, data);
  }

  async setVariantActive(id: string, active: boolean) {
    this.db.variants.find((v) => v.id === id)!.active = active;
  }

  async deleteVariant(id: string) {
    this.db.variants = this.db.variants.filter((v) => v.id !== id);
  }

  private variantIdsOf(productId: string) {
    return this.db.variants.filter((v) => v.productId === productId).map((v) => v.id);
  }

  async isProductUsedInOrders(productId: string) {
    return this.variantIdsOf(productId).some((id) => this.db.variantsInOrders.has(id));
  }

  async isVariantUsedInOrders(variantId: string) {
    return this.db.variantsInOrders.has(variantId);
  }

  async isProductInAnyMenu(productId: string) {
    const ids = this.variantIdsOf(productId);
    return this.db.items.some((i) => ids.includes(i.variantId));
  }

  async isVariantInAnyMenu(variantId: string) {
    return this.db.items.some((i) => i.variantId === variantId);
  }
}

export class MemoryMenusRepository implements MenusRepository {
  constructor(
    private readonly db: MemoryStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assemble(row: MenuRow): Menu {
    return { ...row, items: this.db.items.filter((i) => i.menuId === row.id).map((i) => ({ ...i })) };
  }

  async list(status?: MenuStatus) {
    return this.db.menus
      .filter((m) => !status || m.status === status)
      .sort((a, b) => b.menuDate.localeCompare(a.menuDate))
      .map((m) => this.assemble(m));
  }

  async findById(id: string) {
    const row = this.db.menus.find((m) => m.id === id);
    return row ? this.assemble(row) : null;
  }

  async findActive() {
    const row = this.db.menus.find((m) => m.status === 'ACTIVE');
    return row ? this.assemble(row) : null;
  }

  /** Mesmo resultado da view vw_menu_items. */
  async itemDetails(menuId: string): Promise<MenuItemDetail[]> {
    return this.db.items
      .filter((i) => i.menuId === menuId)
      .map((i) => {
        const v = this.db.variants.find((x) => x.id === i.variantId)!;
        const p = this.db.products.find((x) => x.id === v.productId)!;
        return {
          itemId: i.id,
          productId: p.id,
          productName: p.name,
          productDescription: p.description,
          category: p.category,
          variantId: v.id,
          variantName: v.name,
          standardPriceCents: v.priceCents,
          specialPriceCents: i.specialPriceCents,
          effectivePriceCents: effectivePrice(v.priceCents, i.specialPriceCents),
          available: p.active && v.active,
        };
      });
  }

  async create(data: { name: string; menuDate: string }) {
    const row: MenuRow = { id: randomUUID(), ...data, status: 'DRAFT', activatedAt: null, closedAt: null };
    this.db.menus.push(row);
    return this.assemble(row);
  }

  async update(id: string, data: { name: string; menuDate: string }) {
    Object.assign(this.db.menus.find((m) => m.id === id)!, data);
  }

  async activate(id: string) {
    const row = this.db.menus.find((m) => m.id === id)!;
    row.status = 'ACTIVE';
    row.activatedAt = this.now();
  }

  async close(id: string) {
    const row = this.db.menus.find((m) => m.id === id)!;
    row.status = 'CLOSED';
    row.closedAt = this.now();
  }

  async delete(id: string) {
    this.db.menus = this.db.menus.filter((m) => m.id !== id);
    this.db.items = this.db.items.filter((i) => i.menuId !== id);
  }

  async addItem(menuId: string, variantId: string, specialPriceCents: number | null) {
    const item: MenuItem = { id: randomUUID(), menuId, variantId, specialPriceCents };
    this.db.items.push(item);
    return { ...item };
  }

  async updateItemSpecialPrice(itemId: string, specialPriceCents: number | null) {
    this.db.items.find((i) => i.id === itemId)!.specialPriceCents = specialPriceCents;
  }

  async removeItem(itemId: string) {
    this.db.items = this.db.items.filter((i) => i.id !== itemId);
  }
}

export class MemoryMenuSnapshots implements MenuSnapshotsRepository {
  docs = new Map<string, PublicMenu>();
  fail = false;

  async save(menu: PublicMenu) {
    if (this.fail) throw new Error('Mongo fora do ar');
    this.docs.set(menu.menuId, structuredClone(menu));
  }

  async markClosed(menuId: string) {
    if (this.fail) throw new Error('Mongo fora do ar');
    const doc = this.docs.get(menuId);
    if (doc) doc.status = 'CLOSED';
  }

  async findActiveByDate(date: string) {
    if (this.fail) throw new Error('Mongo fora do ar');
    return [...this.docs.values()].find((d) => d.date === date && d.status === 'ACTIVE') ?? null;
  }
}

export class MemoryDeliveryFeesRepository implements DeliveryFeesRepository {
  rows: DeliveryFeeRange[] = [];

  async listActive() {
    return this.rows.filter((r) => r.active).map((r) => ({ ...r }));
  }

  async findById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  async create(data: FeeRangeData) {
    const row = { id: randomUUID(), ...data, active: true };
    this.rows.push(row);
    return { ...row };
  }

  async update(id: string, data: FeeRangeData) {
    Object.assign(this.rows.find((r) => r.id === id)!, data);
  }

  async deactivate(id: string) {
    this.rows.find((r) => r.id === id)!.active = false;
  }
}

// ---------- Autenticação (módulo base) ----------

/** Usuários em memória; as tentativas de login seguem as procedures do script 023. */
export class MemoryUsersRepository implements UsersRepository {
  users: User[] = [];
  constructor(private readonly now: () => Date = () => new Date()) {}

  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async create(data: CreateUserData) {
    const user: User = {
      id: randomUUID(),
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      passwordHash: data.passwordHash,
      role: data.role,
      active: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.users.push(user);
    return user;
  }
  async list(filter: { role?: Role } = {}): Promise<UserSummary[]> {
    return this.users
      .filter((u) => !filter.role || u.role === filter.role)
      .map(({ passwordHash: _, failedLoginAttempts: __, lockedUntil: ___, ...u }) => ({
        ...u,
        roleLabel: u.role,
        activeSessions: 0,
      }));
  }
  /** Mesma regra da sp_register_login_failure: no limite, bloqueia e zera o contador. */
  async registerLoginFailure(id: string, maxAttempts: number, lockMinutes: number): Promise<LoginFailure> {
    const user = this.users.find((u) => u.id === id)!;
    if (user.failedLoginAttempts + 1 >= maxAttempts) {
      user.lockedUntil = new Date(this.now().getTime() + lockMinutes * 60_000);
      user.failedLoginAttempts = 0;
    } else {
      user.failedLoginAttempts += 1;
    }
    return { failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil };
  }
  async resetLoginFailures(id: string) {
    const user = this.users.find((u) => u.id === id)!;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }
}

export class MemoryRefreshTokensRepository implements RefreshTokensRepository {
  tokens: (RefreshToken & { tokenHash: string })[] = [];
  async create(userId: string, tokenHash: string, expiresAt: Date) {
    this.tokens.push({ id: randomUUID(), userId, tokenHash, expiresAt, revokedAt: null });
  }
  async findByHash(tokenHash: string) {
    return this.tokens.find((t) => t.tokenHash === tokenHash) ?? null;
  }
  async revoke(id: string) {
    const token = this.tokens.find((t) => t.id === id);
    if (token) token.revokedAt = new Date();
  }
  async rotate(): Promise<string> {
    throw new Error('não usado nos testes unitários');
  }
}

export class MemoryAccessLogsRepository implements AccessLogsRepository {
  logs: AccessLog[] = [];
  async record(log: AccessLog) {
    this.logs.push(log);
  }
  async listByUser(userId: string) {
    return this.logs.filter((l) => l.user?.id === userId);
  }
}

/** Códigos de "Esqueci minha senha"; `complete` faz o mesmo que sp_complete_password_reset. */
export class MemoryPasswordResetsRepository implements PasswordResetsRepository {
  resets: (PasswordReset & { usedAt: Date | null })[] = [];
  constructor(
    private readonly users: MemoryUsersRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async create(userId: string, codeHash: string, expiresAt: Date) {
    for (const r of this.resets) if (r.userId === userId && !r.usedAt) r.usedAt = this.now();
    this.resets.push({ id: randomUUID(), userId, codeHash, attempts: 0, expiresAt, usedAt: null });
  }
  async findValid(userId: string) {
    return [...this.resets].reverse().find((r) => r.userId === userId && !r.usedAt && r.expiresAt > this.now()) ?? null;
  }
  async registerAttempt(id: string) {
    const reset = this.resets.find((r) => r.id === id)!;
    reset.attempts += 1;
    return reset.attempts;
  }
  async complete(userId: string, resetId: string, passwordHash: string) {
    const reset = this.resets.find((r) => r.id === resetId && r.userId === userId && !r.usedAt)!;
    reset.usedAt = this.now();
    const user = (await this.users.findById(userId))!;
    Object.assign(user, { passwordHash, failedLoginAttempts: 0, lockedUntil: null });
  }
}

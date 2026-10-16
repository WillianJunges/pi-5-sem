import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '../../src/modules/products/product.types';
import { MenusService, effectivePrice } from '../../src/modules/menus/menus.service';
import { ProductsService } from '../../src/modules/products/products.service';
import { expectAppError } from '../support/expectError';
import {
  MemoryMenuSnapshots,
  MemoryMenusRepository,
  MemoryProductsRepository,
  MemoryStore,
} from '../support/memoryRepositories';

const TODAY = '2026-10-15';
const NOW = new Date('2026-10-15T13:00:00Z');

describe('effectivePrice (regra do escopo)', () => {
  it('usa o preço especial quando existe', () => expect(effectivePrice(2200, 1990)).toBe(1990));
  it('usa o padrão quando não há especial', () => expect(effectivePrice(2200, null)).toBe(2200));
});

describe('Cardápios', () => {
  let db: MemoryStore;
  let snapshots: MemoryMenuSnapshots;
  let products: ProductsService;
  let menus: MenusService;
  let frango: Product;
  let coca: Product;
  let today: string;
  const media = () => frango.variants[1];
  const grande = () => frango.variants[2];
  const lata = () => coca.variants[0];

  beforeEach(async () => {
    db = new MemoryStore();
    snapshots = new MemoryMenuSnapshots();
    today = TODAY;
    const productRepo = new MemoryProductsRepository(db);
    products = new ProductsService(productRepo);
    menus = new MenusService(new MemoryMenusRepository(db, () => NOW), productRepo, snapshots, () => today);
    products.onChange(() => menus.refreshActiveSnapshot());
    frango = await products.create({
      name: 'Marmita de Frango',
      description: 'Arroz, feijão e salada',
      category: 'marmitas',
      variants: [
        { name: 'Pequena', priceCents: 1800 },
        { name: 'Média', priceCents: 2200 },
        { name: 'Grande', priceCents: 2600 },
      ],
    });
    coca = await products.create({ name: 'Coca-Cola', description: null, category: 'bebidas', variants: [{ name: 'Lata', priceCents: 500 }] });
  });

  async function draftWithItems(menuDate = TODAY) {
    const m = await menus.create({ name: 'Cardápio de quinta', menuDate });
    await menus.addItem(m.id, media().id, 1990);
    await menus.addItem(m.id, grande().id, null);
    await menus.addItem(m.id, lata().id, null);
    return m;
  }

  describe('montagem', () => {
    it('cria em rascunho e mostra nomes, preço padrão, especial e o preço que vale', async () => {
      const m = await draftWithItems();
      expect(m.status).toBe('DRAFT');
      const detail = await menus.get(m.id);
      expect(
        detail.items.map((i) => [i.productName, i.variantName, i.standardPriceCents, i.specialPriceCents, i.effectivePriceCents]),
      ).toEqual([
        ['Marmita de Frango', 'Média', 2200, 1990, 1990],
        ['Marmita de Frango', 'Grande', 2600, null, 2600],
        ['Coca-Cola', 'Lata', 500, null, 500],
      ]);
    });

    it('o preço especial não altera o preço padrão do produto', async () => {
      await draftWithItems();
      expect((await products.get(frango.id)).variants[1].priceCents).toBe(2200);
    });

    it('a mesma variação não entra duas vezes', async () => {
      const m = await draftWithItems();
      await expectAppError(menus.addItem(m.id, media().id, null), 409, /já está/);
    });

    it('variação desativada, ou de produto desativado, não entra', async () => {
      const m = await menus.create({ name: 'X', menuDate: TODAY });
      await products.setVariantActive(frango.variants[0].id, false);
      await expectAppError(menus.addItem(m.id, frango.variants[0].id, null), 409, /desativado/);
      await products.setActive(coca.id, false);
      await expectAppError(menus.addItem(m.id, lata().id, null), 409, /desativado/);
    });

    it('define e remove preço especial', async () => {
      const m = await draftWithItems();
      const itemId = (await menus.get(m.id)).items[1].itemId;
      await menus.setSpecialPrice(m.id, itemId, 2300);
      expect((await menus.get(m.id)).items[1].effectivePriceCents).toBe(2300);
      await menus.setSpecialPrice(m.id, itemId, null);
      expect((await menus.get(m.id)).items[1].effectivePriceCents).toBe(2600);
    });

    it('variação, item ou cardápio inexistente: 404; item de outro cardápio também', async () => {
      const a = await draftWithItems();
      const b = await menus.create({ name: 'Outro', menuDate: '2026-10-16' });
      await expectAppError(menus.addItem(b.id, 'nao-existe', null), 404);
      await expectAppError(menus.removeItem(b.id, (await menus.get(a.id)).items[0].itemId), 404);
      await expectAppError(menus.get('nao-existe'), 404);
    });
  });

  describe('ciclo DRAFT → ACTIVE → CLOSED', () => {
    it('ativa e registra o horário', async () => {
      const m = await draftWithItems();
      expect(await menus.activate(m.id)).toMatchObject({ status: 'ACTIVE', activatedAt: NOW });
    });

    it('não ativa vazio, nem com item desativado (e diz qual)', async () => {
      const vazio = await menus.create({ name: 'X', menuDate: TODAY });
      await expectAppError(menus.activate(vazio.id), 409, /ao menos um item/);
      const m = await draftWithItems();
      await products.setActive(coca.id, false);
      await expectAppError(menus.activate(m.id), 409, 'Coca-Cola Lata');
    });

    it('só um cardápio ativo por vez', async () => {
      const a = await draftWithItems();
      await menus.activate(a.id);
      const b = await menus.create({ name: 'Cardápio de sexta', menuDate: '2026-10-16' });
      await menus.addItem(b.id, lata().id, null);
      await expectAppError(menus.activate(b.id), 409, /Cardápio de quinta/);
      await menus.close(a.id);
      await expect(menus.activate(b.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it.each([
      ['ativar um ativo', async (s: MenusService, id: string) => { await s.activate(id); await s.activate(id); }],
      ['encerrar um rascunho', async (s: MenusService, id: string) => { await s.close(id); }],
      ['reativar um encerrado', async (s: MenusService, id: string) => { await s.activate(id); await s.close(id); await s.activate(id); }],
    ])('transição inválida: %s', async (_label, action) => {
      const m = await draftWithItems();
      await expectAppError(action(menus, m.id), 409);
    });

    it('ativo pode ser ajustado, mas não pode ficar vazio', async () => {
      const m = await menus.create({ name: 'X', menuDate: TODAY });
      await menus.addItem(m.id, lata().id, null);
      const item = await menus.addItem(m.id, media().id, null);
      await menus.activate(m.id);
      await menus.removeItem(m.id, item.id);
      const last = (await menus.get(m.id)).items[0];
      await expectAppError(menus.removeItem(m.id, last.itemId), 409, /Encerre/);
    });

    it('encerrado não pode ser alterado nem excluído; só rascunho é excluído', async () => {
      const m = await draftWithItems();
      await menus.activate(m.id);
      await expectAppError(menus.remove(m.id), 409, /rascunho/);
      await menus.close(m.id);
      const itemId = (await menus.get(m.id)).items[0].itemId;
      await expectAppError(menus.update(m.id, { name: 'Y', menuDate: TODAY }), 409);
      await expectAppError(menus.addItem(m.id, frango.variants[0].id, null), 409);
      await expectAppError(menus.setSpecialPrice(m.id, itemId, 100), 409);
      await expectAppError(menus.removeItem(m.id, itemId), 409);

      const d = await menus.create({ name: 'Rascunho', menuDate: '2026-10-20' });
      await menus.addItem(d.id, lata().id, null);
      await menus.remove(d.id);
      await expectAppError(menus.get(d.id), 404);
      expect(db.items.some((i) => i.menuId === d.id)).toBe(false);
    });
  });

  describe('cardápio do dia (cliente) e cópia no MongoDB', () => {
    it('sem cardápio ativo hoje: nada', async () => {
      await draftWithItems();
      expect(await menus.getToday()).toBeNull();
      await expectAppError(menus.priceForOrder(media().id), 409);
    });

    it('agrupa por produto, com o preço que vale e o "a partir de"', async () => {
      const m = await draftWithItems();
      await menus.activate(m.id);
      const pub = (await menus.getToday())!;
      expect(pub).toMatchObject({ menuId: m.id, date: TODAY, status: 'ACTIVE' });
      expect(pub.items).toEqual([
        {
          productId: frango.id,
          name: 'Marmita de Frango',
          description: 'Arroz, feijão e salada',
          category: 'marmitas',
          price: 19.9,
          variations: [
            { variantId: media().id, name: 'Média', price: 19.9, standardPrice: 22 },
            { variantId: grande().id, name: 'Grande', price: 26, standardPrice: 26 },
          ],
        },
        {
          productId: coca.id,
          name: 'Coca-Cola',
          description: null,
          category: 'bebidas',
          price: 5,
          variations: [{ variantId: lata().id, name: 'Lata', price: 5, standardPrice: 5 }],
        },
      ]);
    });

    it('ativar grava a cópia no Mongo; encerrar marca como encerrado', async () => {
      const m = await draftWithItems();
      await menus.activate(m.id);
      expect(snapshots.docs.get(m.id)?.status).toBe('ACTIVE');
      await menus.close(m.id);
      expect(snapshots.docs.get(m.id)?.status).toBe('CLOSED');
      expect(await menus.getToday()).toBeNull();
    });

    it('cardápio ativo de outro dia não aparece como "de hoje"', async () => {
      const m = await draftWithItems('2026-10-14');
      await menus.activate(m.id);
      expect(await menus.getToday()).toBeNull();
      await expectAppError(menus.priceForOrder(media().id), 409);
    });

    it('produto desativado durante o dia some para o cliente na hora (inclusive na cópia)', async () => {
      const m = await draftWithItems();
      await menus.activate(m.id);
      await products.setActive(coca.id, false);
      expect((await menus.getToday())!.items.map((i) => i.name)).toEqual(['Marmita de Frango']);
      await expectAppError(menus.priceForOrder(lata().id), 409);
      expect((await menus.get(m.id)).items.find((i) => i.productName === 'Coca-Cola')?.available).toBe(false);
    });

    it('mudar o preço padrão reflete no cardápio, exceto onde há preço especial', async () => {
      const m = await draftWithItems();
      await menus.activate(m.id);
      await products.updateVariant(media().id, { name: 'Média', priceCents: 2400 });
      await products.updateVariant(grande().id, { name: 'Grande', priceCents: 2800 });
      expect(await menus.priceForOrder(media().id)).toBe(1990);
      expect(await menus.priceForOrder(grande().id)).toBe(2800);
      expect((await menus.getToday())!.items[0].variations[1].price).toBe(28);
    });

    it('Mongo fora do ar não derruba nada: lê e grava pelo MySQL', async () => {
      snapshots.fail = true;
      const m = await draftWithItems();
      await expect(menus.activate(m.id)).resolves.toMatchObject({ status: 'ACTIVE' });
      expect((await menus.getToday())!.items).toHaveLength(2);
      await expect(menus.close(m.id)).resolves.toMatchObject({ status: 'CLOSED' });
    });
  });
});

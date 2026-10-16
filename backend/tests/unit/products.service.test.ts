import { beforeEach, describe, expect, it } from 'vitest';
import { ProductsService } from '../../src/modules/products/products.service';
import { expectAppError } from '../support/expectError';
import { MemoryProductsRepository, MemoryStore } from '../support/memoryRepositories';

const frango = {
  name: 'Marmita de Frango',
  description: 'Frango grelhado com arroz, feijão e salada',
  category: 'marmitas',
  variants: [
    { name: 'Pequena', priceCents: 1800 },
    { name: 'Média', priceCents: 2200 },
    { name: 'Grande', priceCents: 2600 },
  ],
};
const coca = { name: 'Coca-Cola', description: null, category: 'bebidas', variants: [{ name: 'Lata', priceCents: 500 }] };

describe('Produtos e variações', () => {
  let db: MemoryStore;
  let service: ProductsService;
  let changes: number;

  beforeEach(() => {
    db = new MemoryStore();
    service = new ProductsService(new MemoryProductsRepository(db));
    changes = 0;
    service.onChange(async () => {
      changes++;
    });
  });

  describe('cadastro e edição', () => {
    it('cria produto ativo com variações e preços', async () => {
      const p = await service.create(frango);
      expect(p).toMatchObject({ name: 'Marmita de Frango', category: 'marmitas', active: true });
      expect(p.variants.map((v) => [v.name, v.priceCents, v.active])).toEqual([
        ['Pequena', 1800, true],
        ['Média', 2200, true],
        ['Grande', 2600, true],
      ]);
    });

    it('recusa variação repetida no mesmo cadastro, sem diferenciar maiúsculas e acentos', async () => {
      await expectAppError(
        service.create({ ...frango, variants: [{ name: 'Média', priceCents: 1 }, { name: 'MEDIA', priceCents: 2 }] }),
        400,
      );
    });

    it('recusa nome de produto repetido, sem diferenciar maiúsculas', async () => {
      await service.create(frango);
      await expectAppError(service.create({ ...frango, name: 'marmita de frango' }), 409);
    });

    it('edita, pode manter o próprio nome, mas não usar o de outro produto', async () => {
      const a = await service.create(frango);
      await service.create(coca);
      expect(await service.update(a.id, { name: 'Marmita de Frango', description: null, category: 'fit' })).toMatchObject({
        description: null,
        category: 'fit',
      });
      await expectAppError(service.update(a.id, { name: 'COCA-COLA', description: null, category: null }), 409);
    });

    it('produto inexistente: 404', async () => {
      await expectAppError(service.get('nao-existe'), 404);
    });
  });

  describe('variações', () => {
    it('adiciona variação e altera o preço padrão', async () => {
      const p = await service.create(frango);
      const fam = await service.addVariant(p.id, { name: 'Família', priceCents: 4500 });
      expect((await service.updateVariant(fam.id, { name: 'Família', priceCents: 4900 })).priceCents).toBe(4900);
      expect((await service.get(p.id)).variants).toHaveLength(4);
    });

    it('não deixa duas variações com o mesmo nome no produto', async () => {
      const p = await service.create(frango);
      await expectAppError(service.addVariant(p.id, { name: 'grande', priceCents: 1 }), 409);
      const media = p.variants[1];
      await expectAppError(service.updateVariant(media.id, { name: 'Grande', priceCents: 1 }), 409);
      await expect(service.updateVariant(media.id, { name: 'Média', priceCents: 2300 })).resolves.toBeDefined();
    });

    it('o mesmo nome de variação pode existir em produtos diferentes', async () => {
      await service.create(frango);
      await expect(service.create({ ...coca, variants: [{ name: 'Média', priceCents: 900 }] })).resolves.toBeDefined();
    });

    it('não desativa a única variação ativa de um produto ativo', async () => {
      const p = await service.create(coca);
      await expectAppError(service.setVariantActive(p.variants[0].id, false), 409);
    });

    it('exclui variação sem uso; não exclui a última, nem usada em pedido ou cardápio', async () => {
      const p = await service.create(frango);
      await service.removeVariant(p.variants[0].id);
      db.variantsInOrders.add(p.variants[1].id);
      await expectAppError(service.removeVariant(p.variants[1].id), 409, /pedidos/);
      db.items.push({ id: 'i1', menuId: 'm1', variantId: p.variants[2].id, specialPriceCents: null });
      await expectAppError(service.removeVariant(p.variants[2].id), 409, /cardápio/);

      const c = await service.create(coca);
      await expectAppError(service.removeVariant(c.variants[0].id), 409, /ao menos uma variação/);
    });

    it('não exclui a única variação ativa, mesmo havendo inativas', async () => {
      const p = await service.create({ ...coca, variants: [{ name: 'Lata', priceCents: 500 }, { name: '2 L', priceCents: 1200 }] });
      const [lata, garrafa] = p.variants;
      await service.setVariantActive(garrafa.id, false);
      await expectAppError(service.removeVariant(lata.id), 409, /única variação ativa/);
    });

    it('variação inexistente: 404', async () => {
      await expectAppError(service.updateVariant('nao-existe', { name: 'X', priceCents: 1 }), 404);
    });
  });

  describe('desativar e excluir', () => {
    it('desativado some da lista pública, mas continua na lista da proprietária', async () => {
      const p = await service.create(frango);
      await service.setActive(p.id, false);
      expect(await service.list(false)).toEqual([]);
      expect((await service.list(true))[0].active).toBe(false);
    });

    it('não reativa produto sem nenhuma variação ativa', async () => {
      const p = await service.create(coca);
      await service.setActive(p.id, false);
      await service.setVariantActive(p.variants[0].id, false); // permitido: produto já está inativo
      await expectAppError(service.setActive(p.id, true), 409);
    });

    it('exclui produto sem histórico (variações juntas)', async () => {
      const p = await service.create(frango);
      await service.remove(p.id);
      await expectAppError(service.get(p.id), 404);
      expect(db.variants).toEqual([]);
    });

    it('produto usado em pedido não é excluído: deve ser desativado', async () => {
      const p = await service.create(frango);
      db.variantsInOrders.add(p.variants[2].id);
      await expectAppError(service.remove(p.id), 409, /Desative/);
      await expect(service.setActive(p.id, false)).resolves.toMatchObject({ active: false });
    });

    it('produto em cardápio não é excluído', async () => {
      const p = await service.create(frango);
      db.items.push({ id: 'i1', menuId: 'm1', variantId: p.variants[0].id, specialPriceCents: null });
      await expectAppError(service.remove(p.id), 409, /cardápio/);
    });
  });

  it('avisa o cardápio quando algo que o cliente vê muda', async () => {
    const p = await service.create(frango);
    await service.setActive(p.id, false);
    await service.updateVariant(p.variants[0].id, { name: 'Pequena', priceCents: 1900 });
    await service.setVariantActive(p.variants[1].id, false);
    await service.update(p.id, { name: 'Frango Grelhado', description: null, category: null });
    expect(changes).toBe(4);
  });
});

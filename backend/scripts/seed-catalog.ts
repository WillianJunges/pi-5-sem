/**
 * Dados de exemplo do catálogo (desenvolvimento): produtos do Di Casa, faixas de taxa
 * do escopo e um cardápio ATIVO para hoje — assim o app do cliente já mostra o
 * cardápio do dia (GET /menus/today).
 *
 * Uso: npm run db:seed:catalog
 * Pode rodar mais de uma vez: o que já existe é mantido.
 */
import { db } from '../src/config/database';
import { closeMongo } from '../src/config/mongo';
import { deliveryFeesService } from '../src/modules/delivery-fees/deliveryFees.service';
import { menusService } from '../src/modules/menus/menus.service';
import { productsService } from '../src/modules/products/products.service';
import { todayISODate } from '../src/shared/utils/date';

const PRODUCTS = [
  {
    name: 'Marmita de Frango',
    description: 'Frango grelhado com arroz, feijão e salada',
    category: 'marmitas',
    variants: [['Pequena', 2000], ['Média', 2500], ['Grande', 3000]],
  },
  {
    name: 'Marmita de Carne',
    description: 'Carne assada com arroz, feijão e batata',
    category: 'marmitas',
    variants: [['Pequena', 2300], ['Média', 2800], ['Grande', 3300]],
  },
  { name: 'Frango Assado', description: 'Frango inteiro assado temperado', category: 'assados', variants: [['Meio', 2200], ['Inteiro', 4000]] },
  { name: 'Costela Assada', description: 'Costela bovina assada lentamente', category: 'assados', variants: [['Porção 500 g', 5500]] },
  { name: 'Coca-Cola', description: null, category: 'bebidas', variants: [['Lata 350 ml', 500], ['Garrafa 2 L', 1200]] },
] as const;

const FEE_RANGES = [
  { minMeters: 0, maxMeters: 5000, feeCents: 600 },
  { minMeters: 5000, maxMeters: 10000, feeCents: 1000 },
  { minMeters: 10000, maxMeters: 15000, feeCents: 1500 },
];

async function main() {
  const existing = await productsService.list(true);
  for (const p of PRODUCTS) {
    if (existing.some((e) => e.name === p.name)) continue;
    await productsService.create({
      name: p.name,
      description: p.description,
      category: p.category,
      variants: p.variants.map(([name, priceCents]) => ({ name, priceCents })),
    });
    console.log(`Produto criado: ${p.name}`);
  }

  if ((await deliveryFeesService.list()).length === 0) {
    for (const r of FEE_RANGES) await deliveryFeesService.create(r);
    console.log('Faixas de taxa criadas: 0–5 km R$ 6 · 5–10 km R$ 10 · 10–15 km R$ 15');
  }

  const today = todayISODate();
  const active = (await menusService.list('ACTIVE'))[0];
  if (active?.menuDate === today) {
    console.log(`Já existe cardápio ativo hoje: "${active.name}"`);
  } else {
    if (active) {
      await menusService.close(active.id);
      console.log(`Cardápio antigo encerrado: "${active.name}" (${active.menuDate})`);
    }
    const menu = await menusService.create({ name: 'Cardápio do dia (exemplo)', menuDate: today });
    const catalog = await productsService.list(false);
    for (const product of catalog) {
      for (const variant of product.variants) {
        // exemplo de preço especial: Marmita de Frango Média por R$ 22,90
        const special = product.name === 'Marmita de Frango' && variant.name === 'Média' ? 2290 : null;
        await menusService.addItem(menu.id, variant.id, special);
      }
    }
    await menusService.activate(menu.id);
    console.log(`Cardápio de hoje (${today}) criado e ativado.`);
  }
}

main()
  .catch((err) => {
    console.error('Falha ao criar os dados de exemplo:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
    await closeMongo();
  });

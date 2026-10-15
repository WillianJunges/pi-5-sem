import { describe, expect, it } from 'vitest';
import { feeRangeSchema, quoteQuerySchema } from '../../src/modules/delivery-fees/deliveryFees.schemas';
import { addItemSchema, menuSchema } from '../../src/modules/menus/menus.schemas';
import { createProductSchema, productSchema } from '../../src/modules/products/products.schemas';
import { centsToDecimal, decimalToCents, toCents } from '../../src/shared/utils/money';

describe('dinheiro', () => {
  it('converte reais ↔ centavos sem erro de arredondamento', () => {
    expect(toCents(19.9)).toBe(1990);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(decimalToCents('22.50')).toBe(2250);
    expect(centsToDecimal(1990)).toBe('19.90');
  });
});

describe('validação de produto', () => {
  const ok = { name: '  Marmita de Frango ', category: ' Marmitas ', variants: [{ name: ' Média ', price: 22.5 }] };

  it('limpa espaços, põe categoria em minúsculas e converte preço para centavos', () => {
    expect(createProductSchema.parse(ok)).toEqual({
      name: 'Marmita de Frango',
      description: null,
      category: 'marmitas',
      variants: [{ name: 'Média', price: 2250 }],
    });
  });

  it.each([
    [{ ...ok, name: '' }, 'nome vazio'],
    [{ ...ok, name: 'a'.repeat(121) }, 'nome longo'],
    [{ ...ok, variants: [] }, 'sem variações'],
    [{ ...ok, variants: [{ name: 'Média', price: 0 }] }, 'preço zero'],
    [{ ...ok, variants: [{ name: 'Média', price: 19.999 }] }, '3 casas decimais'],
    [{ ...ok, variants: [{ name: 'Média', price: '22' }] }, 'preço como texto'],
    [{ ...ok, variants: [{ name: 'Média', price: 10_000.01 }] }, 'acima do limite'],
    [{ ...ok, variants: [{ name: '', price: 22 }] }, 'variação sem nome'],
  ] as [unknown, string][])('recusa: %o (%s)', (input) => {
    expect(createProductSchema.safeParse(input).success).toBe(false);
  });

  it('descrição vazia vira null', () => {
    expect(productSchema.parse({ name: 'Coca-Cola', description: '' }).description).toBeNull();
  });
});

describe('validação de cardápio', () => {
  it('data no formato AAAA-MM-DD e válida', () => {
    expect(menuSchema.safeParse({ name: 'Quinta', menuDate: '2026-10-15' }).success).toBe(true);
    expect(menuSchema.safeParse({ name: 'Quinta', menuDate: '15/10/2026' }).success).toBe(false);
    expect(menuSchema.safeParse({ name: 'Quinta', menuDate: '2026-02-30' }).success).toBe(false);
  });

  it('item: variação em UUID; preço especial opcional em reais', () => {
    const id = '0b8f7b0e-5b0a-4b8e-9a4e-1f2a3b4c5d6e';
    expect(addItemSchema.parse({ variantId: id })).toEqual({ variantId: id, specialPrice: null });
    expect(addItemSchema.parse({ variantId: id, specialPrice: 19.9 }).specialPrice).toBe(1990);
    expect(addItemSchema.safeParse({ variantId: '12' }).success).toBe(false);
    expect(addItemSchema.safeParse({ variantId: id, specialPrice: 0 }).success).toBe(false);
  });
});

describe('validação de faixa de taxa', () => {
  it('km e reais → metros e centavos', () => {
    expect(feeRangeSchema.parse({ minKm: 0, maxKm: 5.5, fee: 6 })).toEqual({ minKm: 0, maxKm: 5500, fee: 600 });
  });

  it('taxa zero é aceita; negativa não', () => {
    expect(feeRangeSchema.safeParse({ minKm: 0, maxKm: 2, fee: 0 }).success).toBe(true);
    expect(feeRangeSchema.safeParse({ minKm: 0, maxKm: 2, fee: -1 }).success).toBe(false);
    expect(feeRangeSchema.safeParse({ minKm: -1, maxKm: 2, fee: 1 }).success).toBe(false);
  });

  it('distância da simulação vem da URL como texto', () => {
    expect(quoteQuerySchema.parse({ distanceKm: '3.2' })).toEqual({ distanceKm: 3200 });
    expect(quoteQuerySchema.safeParse({}).success).toBe(false);
    expect(quoteQuerySchema.safeParse({ distanceKm: 'abc' }).success).toBe(false);
  });
});

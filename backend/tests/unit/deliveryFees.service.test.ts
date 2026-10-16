import { beforeEach, describe, expect, it } from 'vitest';
import { DeliveryFeesService } from '../../src/modules/delivery-fees/deliveryFees.service';
import { expectAppError } from '../support/expectError';
import { MemoryDeliveryFeesRepository } from '../support/memoryRepositories';

// Faixas do exemplo do escopo: 0–5 km R$ 6, 5–10 km R$ 10, 10–15 km R$ 15 (metros e centavos)
async function seedEscopo(service: DeliveryFeesService) {
  await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
  await service.create({ minMeters: 5000, maxMeters: 10000, feeCents: 1000 });
  await service.create({ minMeters: 10000, maxMeters: 15000, feeCents: 1500 });
}

const newService = () => new DeliveryFeesService(new MemoryDeliveryFeesRepository());

describe('Taxa de entrega — escolha da faixa', () => {
  let service: DeliveryFeesService;

  beforeEach(async () => {
    service = newService();
    await seedEscopo(service);
  });

  it.each([
    [0, 600],
    [1, 600],
    [3200, 600],
    [5000, 600], // limite: 5 km exatos ficam na primeira faixa
    [5001, 1000],
    [10000, 1000],
    [10001, 1500],
    [15000, 1500],
  ])('%i m → %i centavos', async (distance, fee) => {
    expect(await service.quote(distance)).toMatchObject({ covered: true, feeCents: fee, distanceMeters: distance });
  });

  it('acima da última faixa: fora da área atendida', async () => {
    expect(await service.quote(15001)).toEqual({ covered: false, distanceMeters: 15001 });
  });

  it('sem faixas cadastradas: fora da área', async () => {
    expect((await newService().quote(1000)).covered).toBe(false);
  });

  it('buraco entre faixas: fora da área', async () => {
    const s = newService();
    await s.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    await s.create({ minMeters: 8000, maxMeters: 12000, feeCents: 1200 });
    expect((await s.quote(6500)).covered).toBe(false);
    expect(await s.quote(9000)).toMatchObject({ covered: true, feeCents: 1200 });
  });

  it('faixa que não começa em 0 não cobre a própria distância inicial', async () => {
    const s = newService();
    await s.create({ minMeters: 2000, maxMeters: 5000, feeCents: 500 });
    expect((await s.quote(2000)).covered).toBe(false);
    expect((await s.quote(2001)).covered).toBe(true);
  });

  it('taxa zero (entrega grátis) é válida', async () => {
    const s = newService();
    await s.create({ minMeters: 0, maxMeters: 2000, feeCents: 0 });
    expect(await s.quote(1500)).toMatchObject({ covered: true, feeCents: 0 });
  });

  it.each([[-1], [1.5], [Number.NaN]])('distância inválida (%s)', async (bad) => {
    await expectAppError(service.quote(bad), 400);
  });
});

describe('Taxa de entrega — cadastro', () => {
  let service: DeliveryFeesService;

  beforeEach(() => {
    service = newService();
  });

  it('lista em ordem de distância', async () => {
    await service.create({ minMeters: 5000, maxMeters: 10000, feeCents: 1000 });
    await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    expect((await service.list()).map((r) => r.minMeters)).toEqual([0, 5000]);
  });

  it('faixas que só encostam na ponta são aceitas', async () => {
    await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    await expect(service.create({ minMeters: 5000, maxMeters: 8000, feeCents: 900 })).resolves.toBeDefined();
  });

  it.each([
    [{ minMeters: 4000, maxMeters: 8000 }, 'começa dentro de outra'],
    [{ minMeters: 0, maxMeters: 3000 }, 'fica dentro de outra'],
    [{ minMeters: 0, maxMeters: 20000 }, 'engloba outra'],
  ])('recusa faixa sobreposta: %o (%s)', async (range) => {
    await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    await expectAppError(service.create({ ...range, feeCents: 700 }), 409, 'faixa de 0 km a 5 km');
  });

  it.each([
    [{ minMeters: 5000, maxMeters: 5000, feeCents: 600 }],
    [{ minMeters: 6000, maxMeters: 5000, feeCents: 600 }],
  ])('recusa fim menor ou igual ao início: %o', async (input) => {
    await expectAppError(service.create(input), 400);
  });

  it('editar não conflita com a própria faixa, mas conflita com outra', async () => {
    const a = await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    const b = await service.create({ minMeters: 5000, maxMeters: 10000, feeCents: 1000 });
    expect(await service.update(a.id, { minMeters: 0, maxMeters: 4000, feeCents: 700 })).toMatchObject({ maxMeters: 4000 });
    await expectAppError(service.update(b.id, { minMeters: 3000, maxMeters: 10000, feeCents: 1000 }), 409);
  });

  it('remover desativa: sai da lista e do cálculo, e libera o trecho', async () => {
    const r = await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    await service.remove(r.id);
    expect(await service.list()).toEqual([]);
    expect((await service.quote(1000)).covered).toBe(false);
    await expect(service.create({ minMeters: 0, maxMeters: 5000, feeCents: 800 })).resolves.toBeDefined();
  });

  it('faixa inexistente ou já removida: 404', async () => {
    await expectAppError(service.update('nao-existe', { minMeters: 0, maxMeters: 1, feeCents: 1 }), 404);
    const r = await service.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    await service.remove(r.id);
    await expectAppError(service.remove(r.id), 404);
  });
});

import { AppError } from '../../shared/errors/AppError';
import type { DeliveryFeeRange, FeeQuote, FeeRangeData } from './deliveryFee.types';
import { type DeliveryFeesRepository, deliveryFeesRepository } from './deliveryFees.repository';

/**
 * Uma faixa cobre distâncias MAIORES que o início e ATÉ o fim (inclusive).
 * A faixa que começa em 0 também cobre a distância 0.
 * Com 0–5 km e 5–10 km, exatamente 5 km cai na primeira.
 * (Mesma regra da function fn_delivery_fee no banco.)
 */
export function rangeCovers(range: Pick<DeliveryFeeRange, 'minMeters' | 'maxMeters'>, distanceMeters: number): boolean {
  const aboveMin = distanceMeters > range.minMeters || (range.minMeters === 0 && distanceMeters === 0);
  return aboveMin && distanceMeters <= range.maxMeters;
}

/** Duas faixas se sobrepõem se dividem algum trecho (encostar na ponta não conta). */
function overlaps(a: Pick<DeliveryFeeRange, 'minMeters' | 'maxMeters'>, b: Pick<DeliveryFeeRange, 'minMeters' | 'maxMeters'>) {
  return a.minMeters < b.maxMeters && b.minMeters < a.maxMeters;
}

const km = (meters: number) => `${(meters / 1000).toLocaleString('pt-BR')} km`;

/** Faixas de distância e taxa de entrega (escopo, seção 19). */
export class DeliveryFeesService {
  constructor(private readonly repo: DeliveryFeesRepository) {}

  list(): Promise<DeliveryFeeRange[]> {
    return this.repo.listActive().then((ranges) => [...ranges].sort((a, b) => a.minMeters - b.minMeters));
  }

  async create(data: FeeRangeData): Promise<DeliveryFeeRange> {
    this.validate(data);
    await this.ensureNoOverlap(data);
    return this.repo.create(data);
  }

  async update(id: string, data: FeeRangeData): Promise<DeliveryFeeRange> {
    await this.getActive(id);
    this.validate(data);
    await this.ensureNoOverlap(data, id);
    await this.repo.update(id, data);
    return (await this.repo.findById(id))!;
  }

  /** Só desativa: pedidos antigos guardam a taxa aplicada, não a faixa. */
  async remove(id: string): Promise<void> {
    await this.getActive(id);
    await this.repo.deactivate(id);
  }

  /**
   * Taxa para uma distância por vias, em metros. Sem faixa que cubra: fora da área atendida.
   * Para o módulo de pedidos (cliente) usar ao calcular o total.
   */
  async quote(distanceMeters: number): Promise<FeeQuote> {
    if (!Number.isInteger(distanceMeters) || distanceMeters < 0) {
      throw new AppError('Distância inválida', 400);
    }
    const match = (await this.repo.listActive()).find((r) => rangeCovers(r, distanceMeters));
    if (!match) return { covered: false, distanceMeters };
    return { covered: true, rangeId: match.id, distanceMeters, feeCents: match.feeCents };
  }

  private async getActive(id: string) {
    const range = await this.repo.findById(id);
    if (!range || !range.active) throw new AppError('Faixa de taxa não encontrada', 404);
    return range;
  }

  private validate(data: FeeRangeData) {
    if (data.maxMeters <= data.minMeters) {
      throw new AppError('A distância final deve ser maior que a distância inicial', 400);
    }
  }

  private async ensureNoOverlap(data: FeeRangeData, ignoreId?: string) {
    const clash = (await this.repo.listActive()).find((r) => r.id !== ignoreId && overlaps(r, data));
    if (clash) {
      throw new AppError(`Essa faixa se sobrepõe à faixa de ${km(clash.minMeters)} a ${km(clash.maxMeters)}`, 409);
    }
  }
}

export const deliveryFeesService = new DeliveryFeesService(deliveryFeesRepository);

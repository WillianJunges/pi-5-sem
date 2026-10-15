import { AppError } from '../../shared/errors/AppError';
import { geoService } from '../geo/geo.service';
import type { Address } from './address.types';
import { addressesRepository } from './addresses.repository';
import type { AddressInput } from './addresses.schemas';

const MAX_ADDRESSES = 10;

async function withCoordinates({ isDefault: _, ...data }: AddressInput) {
  const coords = await geoService.geocode(data);
  return { ...data, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null };
}

export const addressesService = {
  list(userId: string): Promise<Address[]> {
    return addressesRepository.listByUser(userId);
  },

  async get(userId: string, id: string): Promise<Address> {
    const address = await addressesRepository.findById(userId, id);
    if (!address) throw new AppError('Endereço não encontrado', 404);
    return address;
  },

  /** Cria o endereço. O primeiro endereço do cliente vira o principal automaticamente. */
  async create(userId: string, input: AddressInput): Promise<Address> {
    const current = await addressesRepository.listByUser(userId);
    if (current.length >= MAX_ADDRESSES) {
      throw new AppError(`Limite de ${MAX_ADDRESSES} endereços atingido. Exclua um para cadastrar outro.`);
    }

    const id = await addressesRepository.create(userId, await withCoordinates(input));
    if (input.isDefault || !(await addressesRepository.hasDefault(userId))) {
      await addressesRepository.setDefault(userId, id);
    }
    return this.get(userId, id);
  },

  async update(userId: string, id: string, input: AddressInput): Promise<Address> {
    const updated = await addressesRepository.update(userId, id, await withCoordinates(input));
    if (!updated) throw new AppError('Endereço não encontrado', 404);
    if (input.isDefault) await addressesRepository.setDefault(userId, id);
    return this.get(userId, id);
  },

  setDefault(userId: string, id: string): Promise<void> {
    return addressesRepository.setDefault(userId, id);
  },

  delete(userId: string, id: string): Promise<void> {
    return addressesRepository.delete(userId, id);
  },
};

import bcrypt from 'bcryptjs';
import { AppError } from '../../shared/errors/AppError';
import type { UserSummary } from '../users/user.types';
import { usersRepository } from '../users/users.repository';
import { type CouriersRepository, couriersRepository } from './couriers.repository';
import type { CreateCourierInput, UpdateCourierInput } from './couriers.schemas';

/**
 * Cadastro e gestão de motoboys pela proprietária (item 4; escopo, seção 3:
 * "contas de motoboy deverão ser criadas ou autorizadas pela proprietária").
 * Motoboy não é excluído: é desativado, para não perder o histórico de entregas.
 */
export class CouriersService {
  constructor(
    private readonly couriers: CouriersRepository,
    private readonly createUser: typeof usersRepository.create = (data) => usersRepository.create(data),
  ) {}

  list() {
    return this.couriers.list();
  }

  async get(id: string): Promise<UserSummary> {
    const courier = await this.couriers.findById(id);
    if (!courier) throw new AppError('Motoboy não encontrado', 404);
    return courier;
  }

  async create(input: CreateCourierInput): Promise<UserSummary> {
    const user = await this.createUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: 'COURIER',
    });
    return this.get(user.id);
  }

  async update(id: string, input: UpdateCourierInput): Promise<UserSummary> {
    await this.get(id);
    await this.couriers.update(id, input);
    return this.get(id);
  }

  async setActive(id: string, active: boolean): Promise<UserSummary> {
    await this.get(id);
    await this.couriers.setActive(id, active);
    return this.get(id);
  }
}

export const couriersService = new CouriersService(couriersRepository);

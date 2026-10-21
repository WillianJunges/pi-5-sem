import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerSchema } from '../../src/modules/auth/auth.schemas';
import { changePasswordSchema, updateProfileSchema } from '../../src/modules/users/users.schemas';
import { UsersService } from '../../src/modules/users/users.service';
import { phoneSchema } from '../../src/shared/utils/phone';
import { expectAppError } from '../support/expectError';
import { MemoryUsersRepository } from '../support/memoryRepositories';

describe('Telefone', () => {
  it.each([
    ['19999998888', '(19) 99999-8888'],
    ['(19) 99999-8888', '(19) 99999-8888'],
    [' 19 3333-4444 ', '(19) 3333-4444'],
  ])('%s → %s', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it.each([[''], ['9999-8888'], ['199999988881']])('"%s" é inválido', (input) => {
    expect(() => phoneSchema.parse(input)).toThrow();
  });

  it('é obrigatório no cadastro', () => {
    const data = { name: 'Ana', email: 'ana@teste.com', password: '123456' };
    expect(() => registerSchema.parse(data)).toThrow(/telefone/i);
    expect(registerSchema.parse({ ...data, phone: '19999998888' }).phone).toBe('(19) 99999-8888');
  });
});

describe('Meu perfil', () => {
  let users: MemoryUsersRepository;
  let service: UsersService;
  let id: string;

  beforeEach(async () => {
    users = new MemoryUsersRepository();
    service = new UsersService(users);
    const user = await users.create({
      name: 'Ana',
      email: 'ana@teste.com',
      phone: null,
      passwordHash: await bcrypt.hash('senha-atual', 4),
      role: 'CUSTOMER',
    });
    id = user.id;
  });

  it('edita nome e telefone (o telefone fica formatado)', async () => {
    const input = updateProfileSchema.parse({ name: '  Ana Souza ', phone: '19999998888' });
    const user = await service.updateProfile(id, input);
    expect(user).toMatchObject({ name: 'Ana Souza', phone: '(19) 99999-8888', email: 'ana@teste.com' });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('nome curto ou sem telefone: inválido', () => {
    expect(() => updateProfileSchema.parse({ name: 'A', phone: '19999998888' })).toThrow();
    expect(() => updateProfileSchema.parse({ name: 'Ana' })).toThrow();
  });

  it('troca a senha com a senha atual certa', async () => {
    await service.changePassword(id, { currentPassword: 'senha-atual', newPassword: 'senha-nova' });
    expect(await bcrypt.compare('senha-nova', (await users.findById(id))!.passwordHash)).toBe(true);
  });

  it('senha atual errada: recusa', async () => {
    await expectAppError(service.changePassword(id, { currentPassword: 'errada', newPassword: 'senha-nova' }), 400, /atual/);
  });

  it('senha nova igual à atual: recusa', async () => {
    await expectAppError(
      service.changePassword(id, { currentPassword: 'senha-atual', newPassword: 'senha-atual' }),
      400,
      /diferente/,
    );
  });

  it('senha nova com menos de 6 caracteres: inválido', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: 'x', newPassword: '123' })).toThrow();
  });

  it('usuário desativado não edita', async () => {
    (await users.findById(id))!.active = false;
    await expectAppError(service.updateProfile(id, { name: 'Ana', phone: '(19) 99999-8888' }), 404);
  });
});

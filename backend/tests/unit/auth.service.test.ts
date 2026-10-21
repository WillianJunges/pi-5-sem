import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, LOCK_MINUTES, MAX_LOGIN_ATTEMPTS } from '../../src/modules/auth/auth.service';
import { expectAppError } from '../support/expectError';
import {
  MemoryAccessLogsRepository,
  MemoryRefreshTokensRepository,
  MemoryUsersRepository,
} from '../support/memoryRepositories';

const EMAIL = 'ana@teste.com';
const PASSWORD = 'senha-certa';

describe('Login — limite de tentativas', () => {
  let now: Date;
  let users: MemoryUsersRepository;
  let logs: MemoryAccessLogsRepository;
  let service: AuthService;

  const login = (password: string) => service.login({ email: EMAIL, password });
  /** Erra a senha `n` vezes (ignorando os erros). */
  const fail = async (n: number) => {
    for (let i = 0; i < n; i++) await login('errada').catch(() => undefined);
  };
  const minutesLater = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60_000);
  };

  beforeEach(async () => {
    now = new Date('2026-10-20T15:00:00Z');
    users = new MemoryUsersRepository(() => now);
    logs = new MemoryAccessLogsRepository();
    service = new AuthService(users, new MemoryRefreshTokensRepository(), logs, () => now);
    await users.create({ name: 'Ana', email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), role: 'CUSTOMER' });
  });

  it('até a 5ª senha errada: só "e-mail ou senha inválidos"', async () => {
    await fail(4);
    await expectAppError(login('errada'), 401, /^E-mail ou senha inválidos$/);
  });

  it('da 6ª em diante avisa quantas tentativas restam', async () => {
    await fail(5);
    await expectAppError(login('errada'), 401, /Restam 4 tentativas/);
    await fail(2);
    await expectAppError(login('errada'), 401, /Resta 1 tentativa /);
  });

  it(`na ${MAX_LOGIN_ATTEMPTS}ª bloqueia por ${LOCK_MINUTES} minutos`, async () => {
    await fail(MAX_LOGIN_ATTEMPTS - 1);
    await expectAppError(login('errada'), 429, /bloqueado por 10 minutos/);
  });

  it('bloqueado: nem a senha certa entra, e a mensagem diz quanto falta', async () => {
    await fail(MAX_LOGIN_ATTEMPTS);
    minutesLater(3.5);
    await expectAppError(login(PASSWORD), 429, /Tente de novo em 7 minutos/);
    expect(logs.logs.at(-1)?.event).toBe('LOGIN_LOCKED');
  });

  it('depois dos 10 minutos libera, com as tentativas zeradas', async () => {
    await fail(MAX_LOGIN_ATTEMPTS);
    minutesLater(LOCK_MINUTES);
    await expectAppError(login('errada'), 401, /^E-mail ou senha inválidos$/);
    expect((await login(PASSWORD)).user.email).toBe(EMAIL);
  });

  it('acertar a senha zera o contador', async () => {
    await fail(7);
    await login(PASSWORD);
    expect((await users.findByEmail(EMAIL))?.failedLoginAttempts).toBe(0);
    await expectAppError(login('errada'), 401, /^E-mail ou senha inválidos$/);
  });

  it('e-mail que não existe: erro genérico, sem contador', async () => {
    await expectAppError(service.login({ email: 'ninguem@teste.com', password: 'x' }), 401, /^E-mail ou senha inválidos$/);
  });

  it('o app nunca recebe o contador nem o bloqueio', async () => {
    const { user } = await login(PASSWORD);
    expect(user).not.toHaveProperty('failedLoginAttempts');
    expect(user).not.toHaveProperty('lockedUntil');
    expect(user).not.toHaveProperty('passwordHash');
  });
});

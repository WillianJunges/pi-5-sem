import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, MAX_LOGIN_ATTEMPTS } from '../../src/modules/auth/auth.service';
import { forgotPasswordSchema, resetPasswordSchema } from '../../src/modules/auth/auth.schemas';
import { MAX_RESET_ATTEMPTS, PasswordResetService, RESET_CODE_MINUTES } from '../../src/modules/auth/passwordReset.service';
import { expectAppError } from '../support/expectError';
import {
  MemoryAccessLogsRepository,
  MemoryPasswordResetsRepository,
  MemoryRefreshTokensRepository,
  MemoryUsersRepository,
} from '../support/memoryRepositories';

const EMAIL = 'ana@teste.com';

describe('Esqueci minha senha', () => {
  let now: Date;
  let users: MemoryUsersRepository;
  let resets: MemoryPasswordResetsRepository;
  let service: PasswordResetService;
  let auth: AuthService;

  const requestCode = async () => (await service.requestCode({ email: EMAIL })).code!;
  const reset = (code: string, password = 'senha-nova') => service.resetPassword({ email: EMAIL, code, password });
  const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

  beforeEach(async () => {
    now = new Date('2026-10-20T15:00:00Z');
    users = new MemoryUsersRepository(() => now);
    resets = new MemoryPasswordResetsRepository(users, () => now);
    service = new PasswordResetService(users, resets, true, () => now);
    auth = new AuthService(users, new MemoryRefreshTokensRepository(), new MemoryAccessLogsRepository(), () => now);
    await users.create({ name: 'Ana', email: EMAIL, passwordHash: await bcrypt.hash('senha-velha', 4), role: 'CUSTOMER' });
  });

  it('gera um código de 6 números que vale 15 minutos', async () => {
    const result = await service.requestCode({ email: EMAIL });
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresInMinutes).toBe(RESET_CODE_MINUTES);
    expect(resets.resets[0].codeHash).not.toBe(result.code); // só o hash fica guardado
  });

  it('em produção o código não volta na resposta', async () => {
    const prod = new PasswordResetService(users, resets, false, () => now);
    expect(await prod.requestCode({ email: EMAIL })).not.toHaveProperty('code');
  });

  it('e-mail sem conta: 404', async () => {
    await expectAppError(service.requestCode({ email: 'ninguem@teste.com' }), 404);
  });

  it('com o código certo troca a senha: a nova entra e a velha não', async () => {
    await reset(await requestCode());
    expect((await auth.login({ email: EMAIL, password: 'senha-nova' })).user.email).toBe(EMAIL);
    await expectAppError(auth.login({ email: EMAIL, password: 'senha-velha' }), 401);
  });

  it('o código só funciona uma vez', async () => {
    const code = await requestCode();
    await reset(code);
    await expectAppError(reset(code), 400, /Peça um novo código/);
  });

  it('pedir um código novo invalida o anterior', async () => {
    const first = await requestCode();
    const second = await requestCode();
    if (first !== second) await expectAppError(reset(first), 400, /incorreto/);
    await reset(second);
  });

  it('depois de 15 minutos o código expira', async () => {
    const code = await requestCode();
    now = new Date(now.getTime() + RESET_CODE_MINUTES * 60_000 + 1000);
    await expectAppError(reset(code), 400, /expirado/);
  });

  it(`código errado avisa quantas tentativas restam; no ${MAX_RESET_ATTEMPTS}º deixa de valer`, async () => {
    const code = await requestCode();
    await expectAppError(reset(wrongCode(code)), 400, /Restam 4 tentativas/);
    for (let i = 0; i < MAX_RESET_ATTEMPTS - 2; i++) await reset(wrongCode(code)).catch(() => undefined);
    await expectAppError(reset(wrongCode(code)), 400, /deixou de valer/);
    await expectAppError(reset(code), 400, /Peça um novo código/);
  });

  it('trocar a senha tira o bloqueio de login', async () => {
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) await auth.login({ email: EMAIL, password: 'errada' }).catch(() => undefined);
    await expectAppError(auth.login({ email: EMAIL, password: 'senha-velha' }), 429);
    await reset(await requestCode());
    expect((await auth.login({ email: EMAIL, password: 'senha-nova' })).user.email).toBe(EMAIL);
  });

  it('schemas: código com 6 números e senha com pelo menos 6 caracteres', () => {
    expect(forgotPasswordSchema.parse({ email: ' ANA@teste.com ' }).email).toBe(EMAIL);
    expect(() => resetPasswordSchema.parse({ email: EMAIL, code: '12345', password: 'senha-nova' })).toThrow();
    expect(() => resetPasswordSchema.parse({ email: EMAIL, code: '123456', password: '123' })).toThrow();
    expect(resetPasswordSchema.parse({ email: EMAIL, code: ' 123456 ', password: '123456' }).code).toBe('123456');
  });
});

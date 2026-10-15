import { defineConfig } from 'vitest/config';

/**
 * Variáveis usadas nos testes. As de banco apontam para um banco SEPARADO
 * (marmitaria_test), que os testes de integração criam e apagam sozinhos.
 * Valores já definidos no ambiente têm prioridade (ex.: DB_PASSWORD da sua máquina).
 */
const testEnv = {
  NODE_ENV: 'test',
  DB_HOST: process.env.DB_HOST ?? 'localhost',
  DB_PORT: process.env.DB_PORT ?? '3306',
  DB_USER: process.env.DB_USER ?? 'marmitaria',
  DB_PASSWORD: process.env.DB_PASSWORD ?? 'marmitaria',
  DB_NAME: 'marmitaria_test',
  MONGO_URL: '',
  JWT_ACCESS_SECRET: 'segredo-so-para-testes',
  APP_TIMEZONE: 'America/Sao_Paulo',
};

export default defineConfig({
  test: {
    env: testEnv,
    fileParallelism: false,
  },
});

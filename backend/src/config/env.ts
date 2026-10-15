import 'dotenv/config';

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3333),
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME'),
  },
  /** Opcional. Ex.: mongodb://localhost:27017/marmitaria */
  mongoUrl: process.env.MONGO_URL ?? '',
  auth: {
    accessTokenSecret: required('JWT_ACCESS_SECRET'),
    /** Tempo de vida do access token em segundos (padrão: 15 min). */
    accessTokenTtl: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 15 * 60),
    /** Tempo de vida do refresh token em dias (padrão: 30). */
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  },
};

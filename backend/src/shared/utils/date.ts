/** Fuso da marmitaria: "hoje" é o dia no Brasil, não em UTC. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Sao_Paulo';

/** Data de hoje no fuso da marmitaria, no formato AAAA-MM-DD. */
export function todayISODate(now: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD
  return now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

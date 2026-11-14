import { APP_TIMEZONE } from './date';

/** Meia-noite local em UTC, usando os dados de fuso disponíveis no Node. */
function start(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p => [p.type, Number(p.value)]));
    const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += target - local;
  }
  return new Date(guess);
}

export function dayBounds(date: string): { from: Date; until: Date } {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return { from: start(date), until: start(next) };
}

/** Semana começa na segunda-feira; os períodos terminam no dia informado. */
export function periodDates(date: string, period: 'day' | 'week' | 'month'): { startDate: string; endDate: string } {
  const day = new Date(`${date}T12:00:00Z`);
  if (period === 'week') day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  if (period === 'month') day.setUTCDate(1);
  return { startDate: day.toISOString().slice(0, 10), endDate: date };
}

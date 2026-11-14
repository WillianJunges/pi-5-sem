import { describe, expect, it } from 'vitest';
import { businessHoursSchema, isWithinBusinessHours } from '../../src/modules/owner/businessHours';
import { dayBounds, periodDates } from '../../src/shared/utils/dayBounds';

const days = (): { weekday: number; opensAt: string | null; closesAt: string | null }[] =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: null, closesAt: null }));

describe('horário de funcionamento', () => {
  it('aceita dias fechados e dias com abertura e fechamento', () => {
    const schedule = days();
    schedule[1] = { weekday: 1, opensAt: '11:00', closesAt: '14:00' };
    expect(businessHoursSchema.safeParse({ days: schedule }).success).toBe(true);
  });

  it('recusa horário invertido, incompleto e dias repetidos', () => {
    expect(businessHoursSchema.safeParse({ days: days().map(d => d.weekday === 1 ? { ...d, opensAt: '14:00', closesAt: '11:00' } : d) }).success).toBe(false);
    expect(businessHoursSchema.safeParse({ days: days().map(d => d.weekday === 1 ? { ...d, opensAt: '11:00' } : d) }).success).toBe(false);
    expect(businessHoursSchema.safeParse({ days: days().map(d => ({ ...d, weekday: 0 })) }).success).toBe(false);
  });

  it('calcula os limites de um dia no fuso de São Paulo', () => {
    const { from, until } = dayBounds('2026-11-13');
    expect(from.toISOString()).toBe('2026-11-13T03:00:00.000Z');
    expect(until.toISOString()).toBe('2026-11-14T03:00:00.000Z');
  });

  it('libera apenas entre abertura inclusiva e fechamento exclusivo, e fecha sem horário', () => {
    const schedule = days();
    schedule[5] = { weekday: 5, opensAt: '11:00', closesAt: '14:00' };
    expect(isWithinBusinessHours(schedule, new Date('2026-11-13T13:59:00Z'))).toBe(false);
    expect(isWithinBusinessHours(schedule, new Date('2026-11-13T14:00:00Z'))).toBe(true);
    expect(isWithinBusinessHours(schedule, new Date('2026-11-13T16:59:59Z'))).toBe(true);
    expect(isWithinBusinessHours(schedule, new Date('2026-11-13T17:00:00Z'))).toBe(false);
    expect(isWithinBusinessHours(days(), new Date('2026-11-13T15:00:00Z'))).toBe(false);
  });

  it('relatório semanal começa na segunda e mensal no primeiro dia', () => {
    expect(periodDates('2026-11-15', 'week')).toEqual({ startDate: '2026-11-09', endDate: '2026-11-15' });
    expect(periodDates('2026-11-15', 'month')).toEqual({ startDate: '2026-11-01', endDate: '2026-11-15' });
    expect(periodDates('2026-11-15', 'day')).toEqual({ startDate: '2026-11-15', endDate: '2026-11-15' });
  });
});

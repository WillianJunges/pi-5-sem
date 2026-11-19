import { describe, expect, it } from 'vitest';
import { completeBusinessTime, maskBusinessTime, validBusinessTime } from '../src/utils/businessTime';

describe('horário de funcionamento', () => {
  it('insere os dois pontos e aceita horas com um dígito', () => {
    expect(maskBusinessTime('1230')).toBe('12:30');
    expect(maskBusinessTime('830')).toBe('08:30');
    expect(maskBusinessTime('8')).toBe('8');
    expect(completeBusinessTime('8')).toBe('08:00');
    expect(completeBusinessTime('12')).toBe('12:00');
    expect(completeBusinessTime('08:3')).toBe('08:30');
  });
  it('preserva horários inválidos para a validação recusar', () => {
    expect(validBusinessTime(completeBusinessTime('24'))).toBe(false);
    expect(validBusinessTime(completeBusinessTime('23:60'))).toBe(false);
    expect(validBusinessTime(completeBusinessTime(''))).toBe(false);
    expect(validBusinessTime(completeBusinessTime('23:59'))).toBe(true);
  });
});

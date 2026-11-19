/** Formata dígitos durante a edição, permitindo que o usuário apague e corrija. */
export function maskBusinessTime(value: string): string {
  let digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length > 1 && Number(digits[0]) > 2) digits = `0${digits}`.slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

/** Completa horas e minutos parciais; valores fora do relógio continuam inválidos. */
export function completeBusinessTime(value: string): string {
  const masked = maskBusinessTime(value);
  if (!masked) return '';
  const [hour, minute] = masked.split(':');
  if (Number(hour) > 23 || (minute !== undefined && Number(minute.padEnd(2, '0')) > 59)) return masked;
  return `${hour.padStart(2, '0')}:${(minute ?? '').padEnd(2, '0')}`;
}

export const validBusinessTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

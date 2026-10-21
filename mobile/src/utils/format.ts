/** 25 → "R$ 25,00" */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "2026-10-15" → "quinta-feira, 15 de outubro" */
export function formatLongDate(isoDate: string): string {
  // new Date('2026-10-15') seria meia-noite em UTC, que no Brasil ainda é o dia anterior
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Máscara de telefone enquanto digita: "1999" → "(19) 99", "19999998888" → "(19) 99999-8888".
 * O backend confere e guarda no mesmo formato.
 */
export function maskPhone(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = rest.length > 8 ? 5 : 4;
  return rest.length <= split ? `(${ddd}) ${rest}` : `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** true se o telefone tem DDD + número (10 ou 11 dígitos). */
export function isValidPhone(text: string): boolean {
  const digits = text.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

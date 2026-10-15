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

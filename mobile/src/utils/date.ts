/** Data de hoje no fuso do aparelho, no formato AAAA-MM-DD. */
export function todayISODate(): string {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatPercentChange(original: number, converted: number): number {
  if (!Number.isFinite(original) || original <= 0) return 0;
  return Math.round(((original - converted) / original) * 100);
}

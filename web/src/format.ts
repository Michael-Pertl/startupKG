export function formatUsd(value?: number): string {
  const amount = Number(value || 0);
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(amount >= 10_000_000_000 ? 0 : 1)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${Math.round(amount / 1_000_000)}M`;
  }
  return `$${amount.toLocaleString()}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

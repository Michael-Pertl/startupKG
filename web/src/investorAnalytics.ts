import { MarketNode } from "./types";

export function selectResearchRounds(rounds: MarketNode[], options: {
  equityOnly: boolean; comparable: boolean; cutoff: string; excludeLargest: boolean;
}): MarketNode[] {
  let selected = rounds.filter((round) => {
    if (options.equityOnly && /debt|secondary|commitment|credit|loan/i.test(String(round.round_type || ""))) return false;
    if (options.comparable && (!round.round_date || String(round.round_date).slice(5) > options.cutoff.slice(5))) return false;
    return true;
  });
  if (options.excludeLargest) {
    const largest = new Map<string, MarketNode>();
    for (const round of selected) {
      const year = String(round.year);
      const current = largest.get(year);
      if (!current || Number(round.amount_usd) > Number(current.amount_usd)) largest.set(year, round);
    }
    const excluded = new Set([...largest.values()].map((round) => round.id));
    selected = selected.filter((round) => !excluded.has(round.id));
  }
  return selected;
}

export function periodMetrics(rounds: MarketNode[], years: string[]) {
  return [...years].sort().map((year) => {
    const events = rounds.filter((round) => String(round.year) === year);
    const amounts = events.map((round) => Number(round.amount_usd || 0)).sort((a, b) => b - a);
    const funding = amounts.reduce((a, b) => a + b, 0);
    const middle = Math.floor(amounts.length / 2);
    const median = amounts.length ? amounts.length % 2 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2 : 0;
    return { year, events: events.length, companies: new Set(events.map((round) => round.startup_id)).size,
      funding, median, topFiveShare: funding ? amounts.slice(0, 5).reduce((a, b) => a + b, 0) / funding : 0 };
  });
}

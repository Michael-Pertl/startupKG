import { MarketNode } from "./types";

export function selectResearchRounds(rounds: MarketNode[], options: {
  equityOnly: boolean; comparable: boolean; cutoff: string; excludeLargest: boolean;
}): MarketNode[] {
  let selected = rounds.filter((round) => {
    if (options.equityOnly && (/debt|secondary|commitment|credit|loan/i.test(String(round.round_type || ""))
      || ["debt", "secondary", "mixed_primary_secondary", "upper_bound", "committed_capital", "includes_prior_commitments"].includes(String(round.amount_basis || "")))) return false;
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

export function periodMetrics(rounds: MarketNode[], years: string[], companies: Map<string, MarketNode> = new Map()) {
  return [...years].sort().map((year) => {
    const events = rounds.filter((round) => String(round.year) === year);
    const amounts = events.map((round) => Number(round.amount_usd || 0)).sort((a, b) => b - a);
    const funding = amounts.reduce((a, b) => a + b, 0);
    const middle = Math.floor(amounts.length / 2);
    const median = amounts.length ? amounts.length % 2 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2 : 0;
    return { year, events: events.length, companies: new Set(events.map((round) => companies.get(round.id)?.id || round.startup_id || round.startup_name).filter(Boolean)).size,
      funding, median, topFiveShare: funding ? amounts.slice(0, 5).reduce((a, b) => a + b, 0) / funding : 0 };
  });
}

// Spreadsheet exports retain source URLs and neutralize formula-like text.
export function evidenceCsv(rounds: MarketNode[], companies: Map<string, MarketNode>, investors: Map<string, MarketNode[]>) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '\"\"')}"`;
  };
  const rows: unknown[][] = [["company", "country", "region", "domain", "date", "year", "round_type", "amount_usd", "amount_basis", "confidence", "investors", "source_url"]];
  for (const round of rounds) {
    const company = companies.get(round.id);
    rows.push([company?.label || round.startup_name || round.label, company?.country, company?.region,
      company?.domain, round.round_date, round.year, round.round_type, round.amount_usd, round.amount_basis,
      round.confidence, (investors.get(round.id) || []).map((node) => node.label).join("; "), round.source_url]);
  }
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

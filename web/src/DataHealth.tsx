import { useEffect, useState } from "react";

type Health = {
  scope_note: string; latest_funding_date: string | null; unknown_investors: number;
  unreviewed_events: number; generated_at: string;
  source_rechecked_events?: number; funding_events?: number;
  evidence_error?: string;
  assurance?: { status: string; blockers: string[] };
  tavily: { status?: string; completed_at?: string; attempted_at?: string; enabled_for_last_refresh?: boolean };
  pipeline: { status?: string; completed_at?: string };
  rss: { fetched_at?: string; successful_feeds?: number; active_feeds?: number };
  regions: { region: string; events: number; latest_date: string; small_sample: boolean }[];
};

export function DataHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/data_health.json", { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Unavailable");
      return response.json();
    }).then(setHealth).catch((reason) => { if (reason.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="status">Coverage report unavailable. Freshness has not been verified.</p>;
  if (!health) return <p role="status">Loading evidence status...</p>;
  const dateLabel = (value?: string | null) => value ? value.slice(0, 10) : "Never recorded";
  const stale = !health.latest_funding_date || (Date.now() - Date.parse(health.latest_funding_date)) / 86400000 > 30;
  const overdue = (value: string | undefined, hours: number) => {
    const age = value ? (Date.now() - Date.parse(value)) / 3600000 : NaN;
    return !Number.isFinite(age) || age < 0 || age > hours;
  };
  return <section className="evidence-health" aria-label="Evidence coverage">
    <div className="evidence-health-summary">
      <strong>Curated coverage</strong>
      <span>Latest funding evidence: {dateLabel(health.latest_funding_date)}{stale ? " (over 30 days old)" : ""}</span>
      <span>Tavily: {health.tavily.enabled_for_last_refresh === false ? "paused" : (health.tavily.status || "never_run").replace(/_/g, " ")}</span>
      <span>Pipeline: {health.pipeline.status || "never run"}{overdue(health.pipeline.completed_at, 72) ? " (refresh overdue)" : ""}</span>
    </div>
    <details>
      <summary>Coverage and source status</summary>
      <p>{health.scope_note}</p>
      {health.evidence_error ? <p role="alert">{health.evidence_error}</p> : null}
      <p>{health.source_rechecked_events ?? 0}/{health.funding_events ?? 0} rounds have a recorded core-field source recheck.</p>
      {health.assurance?.blockers.length ? <ul>{health.assurance.blockers.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
      <div className="evidence-health-summary">
        <span>{health.unknown_investors} investors missing metadata</span>
        <span>{health.unreviewed_events} discoveries awaiting review</span>
        <span>Pipeline run: {dateLabel(health.pipeline.completed_at)}</span>
        <span>RSS: {health.rss.successful_feeds ?? 0}/{health.rss.active_feeds ?? 0} feeds at {dateLabel(health.rss.fetched_at)}{overdue(health.rss.fetched_at, 48) ? " (discovery overdue)" : ""}</span>
        <span>Tavily checked: {dateLabel(health.tavily.completed_at || health.tavily.attempted_at)}</span>
      </div>
      <div className="research-table-scroll"><table className="research-table">
        <thead><tr><th>Region</th><th>Rounds</th><th>Latest evidence</th><th>Coverage</th></tr></thead>
        <tbody>{health.regions.map((row) => <tr key={row.region}><td>{row.region}</td><td>{row.events}</td><td>{row.latest_date || "Unknown"}</td><td>{row.small_sample ? "Small sample" : "Partial"}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}

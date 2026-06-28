import { useEffect, useMemo, useState } from "react";
import { MarketEdge, MarketGraph, MarketNode, NodeKind } from "./types";
import { formatCount, formatUsd } from "./format";
import "./styles.css";

const kindLabels: Record<NodeKind, string> = {
  startup: "Startup",
  investor: "Investor",
  round: "Funding round",
  country: "Country",
  region: "Region",
  domain: "AI domain",
  year: "Year",
};

const screenshotViews = [
  "Dataset overview",
  "Region comparison",
  "Domain concentration",
  "Investor network",
  "Selected entity detail",
];

function byNumber<T>(rows: T[], selector: (row: T) => number, limit = 10): T[] {
  return [...rows].sort((left, right) => selector(right) - selector(left)).slice(0, limit);
}

function nodeMatches(node: MarketNode, years: string[], regions: string[], domains: string[]): boolean {
  if (years.length && node.year && !years.includes(String(node.year))) return false;
  if (regions.length && node.region && !regions.includes(node.region)) return false;
  if (domains.length && node.domain && !domains.includes(node.domain)) return false;
  return true;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function PillFilter({
  label,
  options,
  selected,
  setSelected,
}: {
  label: string;
  options: string[];
  selected: string[];
  setSelected: (next: string[]) => void;
}) {
  return (
    <section className="filter-block">
      <div className="filter-title">{label}</div>
      <div className="pill-row">
        <button className={!selected.length ? "active" : ""} onClick={() => setSelected([])} type="button">
          All
        </button>
        {options.map((option) => (
          <button
            className={selected.includes(option) ? "active" : ""}
            key={option}
            onClick={() => {
              setSelected(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
            }}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}

function EntityDetail({
  selected,
  graph,
  onSelect,
}: {
  selected?: MarketNode;
  graph: MarketGraph;
  onSelect: (id: string) => void;
}) {
  if (!selected) {
    return (
      <aside className="detail-panel">
        <span>Selection</span>
        <h2>No entity selected</h2>
        <p>Select a startup, investor, round, domain, country, region, or year from the tables.</p>
      </aside>
    );
  }

  const incident = graph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).slice(0, 12);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <aside className="detail-panel">
      <span>{kindLabels[selected.kind]}</span>
      <h2>{selected.label}</h2>
      <dl>
        {selected.region ? (
          <>
            <dt>Region</dt>
            <dd>{selected.region}</dd>
          </>
        ) : null}
        {selected.country ? (
          <>
            <dt>Country</dt>
            <dd>{selected.country}</dd>
          </>
        ) : null}
        {selected.domain ? (
          <>
            <dt>Domain</dt>
            <dd>{selected.domain}</dd>
          </>
        ) : null}
        {selected.amount_usd ? (
          <>
            <dt>Amount</dt>
            <dd>{formatUsd(selected.amount_usd)}</dd>
          </>
        ) : null}
        {selected.source_type ? (
          <>
            <dt>Source type</dt>
            <dd>{selected.source_type}</dd>
          </>
        ) : null}
        {selected.confidence ? (
          <>
            <dt>Confidence</dt>
            <dd>{selected.confidence}</dd>
          </>
        ) : null}
      </dl>
      {selected.source_url ? (
        <a className="source-link" href={selected.source_url} rel="noreferrer" target="_blank">
          Open source
        </a>
      ) : null}
      <h3>Connected entities</h3>
      <div className="connection-list">
        {incident.map((edge) => {
          const otherId = edge.source === selected.id ? edge.target : edge.source;
          const other = nodeById.get(otherId);
          if (!other) return null;
          return (
            <button key={edge.id} onClick={() => onSelect(other.id)} type="button">
              <span>{kindLabels[other.kind]}</span>
              <strong>{other.label}</strong>
              <small>{edge.kind.replace(/_/g, " ")}</small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function App() {
  const [graph, setGraph] = useState<MarketGraph | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    fetch("/data/market_graph.json")
      .then((response) => response.json())
      .then((payload: MarketGraph) => {
        setGraph(payload);
        const defaultSelection =
          payload.nodes.find((node) => node.id === "startup_mistral_ai") ||
          payload.nodes.find((node) => node.kind === "startup") ||
          payload.nodes[0];
        setSelectedId(defaultSelection?.id || "");
      });
  }, []);

  const derived = useMemo(() => {
    if (!graph) return null;
    const filteredNodes = graph.nodes.filter((node) => nodeMatches(node, years, regions, domains));
    const visibleIds = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    const startups = filteredNodes.filter((node) => node.kind === "startup");
    const investors = filteredNodes.filter((node) => node.kind === "investor");
    const rounds = filteredNodes.filter((node) => node.kind === "round");
    const startupFunding = byNumber(startups, (node) => Number(node.visible_mega_round_funding_usd || 0), 8);
    const activeInvestors = byNumber(investors, (node) => Number(node.participated_rounds || 0), 8);
    const largestRounds = byNumber(rounds, (node) => Number(node.amount_usd || 0), 8);
    return { filteredNodes, filteredEdges, startups, investors, rounds, startupFunding, activeInvestors, largestRounds };
  }, [domains, graph, regions, years]);

  if (!graph || !derived) return <main className="loading">Loading portfolio graph explorer...</main>;

  const selected = graph.nodes.find((node) => node.id === selectedId);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <span>Knowledge Graph Portfolio</span>
          <h1>AI Mega-Round Investment Graph Explorer</h1>
          <p>{graph.metadata.scope_note}</p>
        </div>
        <div className="hero-note">
          <strong>Academic demonstrator</strong>
          <p>Built for the Knowledge Graphs mini-project. No accounts, payments, subscriptions, or checkout workflow are included in this branch.</p>
        </div>
      </header>

      <section className="metrics-grid">
        <Metric label="Funding events" value={formatCount(graph.metadata.round_count)} hint="USD 100M+ public rounds" />
        <Metric label="Startups" value={formatCount(graph.metadata.startup_count)} hint="AI-native or AI infrastructure" />
        <Metric label="Investors" value={formatCount(graph.metadata.investor_count)} hint="Lead and participating investors" />
        <Metric label="Relationships" value={formatCount(graph.metadata.edge_count)} hint="Generated graph export edges" />
      </section>

      <section className="filter-panel">
        <PillFilter label="Years" options={graph.facets.years} selected={years} setSelected={setYears} />
        <PillFilter label="Regions" options={graph.facets.regions} selected={regions} setSelected={setRegions} />
        <PillFilter label="AI domains" options={graph.facets.domains} selected={domains} setSelected={setDomains} />
      </section>

      <section className="workspace">
        <div className="analysis-grid">
          <article className="panel">
            <span>Portfolio screenshots</span>
            <h2>Recommended views</h2>
            <ul className="simple-list">
              {screenshotViews.map((view) => (
                <li key={view}>{view}</li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <span>Filtered graph</span>
            <h2>{formatCount(derived.filteredNodes.length)} nodes, {formatCount(derived.filteredEdges.length)} edges</h2>
            <p>
              Current selection contains {formatCount(derived.startups.length)} startups, {formatCount(derived.investors.length)} investors,
              and {formatCount(derived.rounds.length)} funding rounds.
            </p>
          </article>

          <article className="panel table-panel">
            <span>Company concentration</span>
            <h2>Largest startup funding totals</h2>
            <table>
              <thead>
                <tr>
                  <th>Startup</th>
                  <th>Region</th>
                  <th>Funding</th>
                </tr>
              </thead>
              <tbody>
                {derived.startupFunding.map((node) => (
                  <tr key={node.id} onClick={() => setSelectedId(node.id)}>
                    <td>{node.label}</td>
                    <td>{node.region || "-"}</td>
                    <td>{formatUsd(Number(node.visible_mega_round_funding_usd || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="panel table-panel">
            <span>Investor network</span>
            <h2>Most active investors</h2>
            <table>
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Type</th>
                  <th>Rounds</th>
                </tr>
              </thead>
              <tbody>
                {derived.activeInvestors.map((node) => (
                  <tr key={node.id} onClick={() => setSelectedId(node.id)}>
                    <td>{node.label}</td>
                    <td>{node.investor_type || "-"}</td>
                    <td>{formatCount(Number(node.participated_rounds || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="panel table-panel">
            <span>Funding evidence</span>
            <h2>Largest rounds</h2>
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Year</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {derived.largestRounds.map((node) => (
                  <tr key={node.id} onClick={() => setSelectedId(node.id)}>
                    <td>{node.label}</td>
                    <td>{node.year || "-"}</td>
                    <td>{formatUsd(Number(node.amount_usd || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>

        <EntityDetail graph={graph} onSelect={setSelectedId} selected={selected} />
      </section>
    </main>
  );
}

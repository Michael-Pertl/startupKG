import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition, NodeSingular } from "cytoscape";
import { MarketEdge, MarketEventFeed, MarketGraph, MarketNode, NodeKind } from "./types";
import { formatCount, formatUsd } from "./format";
import { supabase, SupabaseSession } from "./supabaseClient";
import "./styles.css";

const kindLabels: Record<NodeKind, string> = {
  startup: "Company",
  investor: "Investor",
  round: "Funding event",
  country: "Country",
  region: "Region",
  domain: "AI domain",
  year: "Year",
};

type ThemeMode = "dark" | "light";

const nodeColors: Record<ThemeMode, Record<NodeKind, string>> = {
  dark: {
    startup: "#6fa89b",
    investor: "#7f8faa",
    round: "#b9905f",
    country: "#a69f91",
    region: "#878c8b",
    domain: "#9a9274",
    year: "#7f99a3",
  },
  light: {
    startup: "#4f897d",
    investor: "#667795",
    round: "#9a7146",
    country: "#837b6d",
    region: "#747a78",
    domain: "#7f795f",
    year: "#607f8b",
  },
};

const graphThemeColors: Record<
  ThemeMode,
  {
    label: string;
    outline: string;
    selected: string;
    baseEdge: string;
    investorEdge: string;
    raisedEdge: string;
    contextEdge: string;
  }
> = {
  dark: {
    label: "#d8d4c8",
    outline: "#111313",
    selected: "#c8a96a",
    baseEdge: "#3b403f",
    investorEdge: "#69758f",
    raisedEdge: "#b78b55",
    contextEdge: "#7f7869",
  },
  light: {
    label: "#2d302d",
    outline: "#f2efe7",
    selected: "#9a7146",
    baseEdge: "#a6aaa6",
    investorEdge: "#76839c",
    raisedEdge: "#a57a4c",
    contextEdge: "#918979",
  },
};

const confidenceHelp: Record<string, string> = {
  high: "Press release, Reuters, official filing, or equivalent primary source.",
  medium: "Reputable secondary startup or technology publication.",
  low: "Weak, unclear, or seed-only source. Use cautiously.",
};

const graphLegendKinds: NodeKind[] = ["startup", "investor", "round", "country", "domain", "year"];

type Expansion = {
  rounds: boolean;
  investors: boolean;
  geography: boolean;
  peers: boolean;
};

type LayoutMode = "flow" | "network";
type AppView = "graph" | "analytics" | "news" | "login" | "account" | "admin";

type AskUsage = {
  user_id?: string;
  plan?: string;
  subscription_status?: string;
  current_period_end?: string | null;
  monthly_ask_limit?: number | null;
  credits_remaining: number;
  credits_per_prompt: number;
  max_requests_per_minute: number;
};

type UpgradePrompt = {
  title: string;
  body: string;
  feature: string;
};

type AdminMarketEvent = {
  candidate_id: string;
  company_name: string;
  event_type: string;
  event_date?: string | null;
  year?: number | null;
  country?: string | null;
  region?: string | null;
  amount_usd?: number | null;
  valuation_usd?: number | null;
  source_url: string;
  source_type: string;
  confidence: string;
  status: string;
  summary?: string | null;
  notes?: string | null;
  review_notes?: string | null;
};

type SubscriptionPlan = {
  id: "free" | "starter" | "pro";
  label: string;
  price: string;
  askAllowance: string;
  description: string;
  features: string[];
};

const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "free",
    label: "Free",
    price: "€0",
    askAllowance: "5 Ask questions total",
    description: "A focused preview for evaluating the product before upgrading.",
    features: ["Graph preview", "Top analytics and featured news", "Small Ask trial"],
  },
  {
    id: "starter",
    label: "Starter",
    price: "€4.99 / month",
    askAllowance: "75 Ask questions / month",
    description: "Unlock the full graph, analytics, and news for regular exploration.",
    features: ["Full graph access", "Full analytics and news", "Monthly Ask allowance", "Recommended for most users"],
  },
  {
    id: "pro",
    label: "Pro",
    price: "€19.99 / month",
    askAllowance: "Unlimited Ask under fair use",
    description: "For power users who follow market signals frequently.",
    features: ["Everything in Starter", "Fair-use protected Ask access", "Priority access to new market-event signals"],
  },
];

const FREE_PREVIEW_LIMITS = {
  graphRounds: 4,
  graphInvestors: 6,
  graphPeers: 0,
  analyticsBars: 3,
  analyticsEvidenceRows: 5,
  newsFeedRows: 6,
  newsIpoRows: 5,
};

function LockedUpgradeRow({
  label,
  onUpgrade,
}: {
  label: string;
  onUpgrade: () => void;
}) {
  return (
    <button className="locked-upgrade-row" onClick={onUpgrade} type="button">
      <span>{label}</span>
      <strong>Upgrade</strong>
    </button>
  );
}

function UpgradePromptModal({
  prompt,
  onClose,
  onViewPlans,
}: {
  prompt: UpgradePrompt;
  onClose: () => void;
  onViewPlans: () => void;
}) {
  return (
    <div className="upgrade-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="upgrade-title"
        aria-modal="true"
        className="upgrade-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close upgrade prompt" className="upgrade-close" onClick={onClose} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <span>{prompt.feature}</span>
        <h2 id="upgrade-title">{prompt.title}</h2>
        <p>{prompt.body}</p>
        <div className="upgrade-actions">
          <button className="upgrade-primary" onClick={onViewPlans} type="button">View Starter</button>
          <button onClick={onClose} type="button">Keep previewing</button>
        </div>
      </section>
    </div>
  );
}

type GraphIndex = {
  nodeById: Map<string, MarketNode>;
  edgesByNode: Map<string, MarketEdge[]>;
  raisedByRound: Map<string, MarketEdge>;
  startupRounds: Map<string, MarketEdge[]>;
};

function signal(node: MarketNode): number {
  return Number(
    node.importance_score ||
      node.visible_mega_round_funding_usd ||
      node.linked_funding_usd ||
      node.amount_usd ||
      node.funding_usd ||
      node.mega_round_count ||
      node.participated_rounds ||
      1,
  );
}

function buildIndex(graph: MarketGraph): GraphIndex {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesByNode = new Map<string, MarketEdge[]>();
  const raisedByRound = new Map<string, MarketEdge>();
  const startupRounds = new Map<string, MarketEdge[]>();

  for (const edge of graph.edges) {
    edgesByNode.set(edge.source, [...(edgesByNode.get(edge.source) || []), edge]);
    edgesByNode.set(edge.target, [...(edgesByNode.get(edge.target) || []), edge]);
    if (edge.kind === "raised") {
      raisedByRound.set(edge.target, edge);
      startupRounds.set(edge.source, [...(startupRounds.get(edge.source) || []), edge]);
    }
  }

  return { nodeById, edgesByNode, raisedByRound, startupRounds };
}

function otherEnd(edge: MarketEdge, nodeId: string): string {
  return edge.source === nodeId ? edge.target : edge.source;
}

function addNode(
  nodeIds: Set<string>,
  nodes: MarketNode[],
  node: MarketNode | undefined,
) {
  if (!node || nodeIds.has(node.id)) return;
  nodeIds.add(node.id);
  nodes.push(node);
}

function addEdge(edgeIds: Set<string>, edges: MarketEdge[], edge: MarketEdge | undefined) {
  if (!edge || edgeIds.has(edge.id)) return;
  edgeIds.add(edge.id);
  edges.push(edge);
}

function roundValue(edge: MarketEdge, index: GraphIndex): number {
  const roundId = edge.kind === "raised" ? edge.target : edge.kind === "participated" ? edge.target : edge.source;
  return Number(index.nodeById.get(roundId)?.amount_usd || edge.amount_usd || 0);
}

function passesRoundFilters(node: MarketNode, years: string[], confidence: string[]) {
  if (node.kind !== "round") return true;
  if (node.year && !years.includes(String(node.year))) return false;
  if (node.confidence && !confidence.includes(node.confidence)) return false;
  return true;
}

function passesRoundScope(
  round: MarketNode,
  index: GraphIndex,
  years: string[],
  countries: string[],
  confidence: string[],
) {
  if (!passesRoundFilters(round, years, confidence)) return false;
  const raised = index.raisedByRound.get(round.id);
  const startup = raised ? index.nodeById.get(raised.source) : undefined;
  if (startup?.country && !countries.includes(startup.country)) return false;
  return true;
}

function passesStartupScope(startup: MarketNode, countries: string[]) {
  if (startup.kind !== "startup") return true;
  return !startup.country || countries.includes(startup.country);
}

function buildNeighborhood(
  selected: MarketNode,
  graph: MarketGraph,
  index: GraphIndex,
  expansion: Expansion,
  years: string[],
  countries: string[],
  confidence: string[],
  isFreePreview: boolean,
): { nodes: MarketNode[]; edges: MarketEdge[] } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const nodes: MarketNode[] = [];
  const edges: MarketEdge[] = [];

  addNode(nodeIds, nodes, selected);

  const incident = index.edgesByNode.get(selected.id) || [];
  const addIncidentEdge = (edge: MarketEdge) => {
    const target = index.nodeById.get(otherEnd(edge, selected.id));
    if (!target) return;
    if (target.kind === "round" && !passesRoundScope(target, index, years, countries, confidence)) return;
    addNode(nodeIds, nodes, target);
    addEdge(edgeIds, edges, edge);
  };

  if (selected.kind === "startup") {
    const startupEdges = incident.filter((edge) => edge.kind === "headquartered_in" || edge.kind === "operates_in");
    if (expansion.geography) startupEdges.forEach(addIncidentEdge);

    const roundEdges = (index.startupRounds.get(selected.id) || [])
      .sort((left, right) => roundValue(right, index) - roundValue(left, index))
      .slice(0, expansion.rounds ? (isFreePreview ? FREE_PREVIEW_LIMITS.graphRounds : 12) : 0);

    for (const edge of roundEdges) {
      const round = index.nodeById.get(edge.target);
      if (!round || !passesRoundScope(round, index, years, countries, confidence)) continue;
      addNode(nodeIds, nodes, round);
      addEdge(edgeIds, edges, edge);

      if (expansion.investors) {
        for (const roundEdge of index.edgesByNode.get(round.id) || []) {
          if (roundEdge.kind !== "participated") continue;
          if (isFreePreview && nodes.filter((node) => node.kind === "investor").length >= FREE_PREVIEW_LIMITS.graphInvestors) {
            break;
          }
          addNode(nodeIds, nodes, index.nodeById.get(roundEdge.source));
          addEdge(edgeIds, edges, roundEdge);
        }
      }
    }

    if (expansion.peers && !isFreePreview) {
      const peers = graph.nodes
        .filter(
          (node) =>
            node.kind === "startup" &&
            node.id !== selected.id &&
            passesStartupScope(node, countries) &&
            (node.domain === selected.domain || node.country === selected.country),
        )
        .sort((left, right) => signal(right) - signal(left))
        .slice(0, 18);
      for (const peer of peers) {
        addNode(nodeIds, nodes, peer);
        for (const edge of index.edgesByNode.get(peer.id) || []) {
          if (edge.kind === "headquartered_in" || edge.kind === "operates_in") {
            const target = index.nodeById.get(otherEnd(edge, peer.id));
            if (target?.id === `country::${selected.country}` || target?.id === `domain::${selected.domain}`) {
              addNode(nodeIds, nodes, target);
              addEdge(edgeIds, edges, edge);
            }
          }
        }
      }
    }
  } else if (selected.kind === "investor") {
    const participationEdges = incident
      .filter((edge) => edge.kind === "participated")
      .sort((left, right) => roundValue(right, index) - roundValue(left, index))
      .slice(0, isFreePreview ? FREE_PREVIEW_LIMITS.graphInvestors : 18);

    for (const edge of participationEdges) {
      const round = index.nodeById.get(edge.target);
      if (!round || !passesRoundScope(round, index, years, countries, confidence)) continue;
      addNode(nodeIds, nodes, round);
      addEdge(edgeIds, edges, edge);

      const raised = index.raisedByRound.get(round.id);
      const startup = raised ? index.nodeById.get(raised.source) : undefined;
      addNode(nodeIds, nodes, startup);
      addEdge(edgeIds, edges, raised);
    }
  } else if (selected.kind === "round") {
    for (const edge of incident) addIncidentEdge(edge);
  } else if (selected.kind === "country" || selected.kind === "domain") {
    const startupEdges = incident
      .filter((edge) => edge.kind === "headquartered_in" || edge.kind === "operates_in")
      .map((edge) => ({ edge, startup: index.nodeById.get(otherEnd(edge, selected.id)) }))
      .filter((item): item is { edge: MarketEdge; startup: MarketNode } => item.startup?.kind === "startup")
      .filter(({ startup }) => passesStartupScope(startup, countries))
      .sort((left, right) => signal(right.startup) - signal(left.startup))
      .slice(0, isFreePreview ? 18 : 42);

    for (const { edge, startup } of startupEdges) {
      addNode(nodeIds, nodes, startup);
      addEdge(edgeIds, edges, edge);
      if (expansion.rounds) {
        const topRound = (index.startupRounds.get(startup.id) || [])
          .sort((left, right) => roundValue(right, index) - roundValue(left, index))
          .find((roundEdge) => {
            const round = index.nodeById.get(roundEdge.target);
            return round ? passesRoundScope(round, index, years, countries, confidence) : false;
          });
        if (topRound) {
          addNode(nodeIds, nodes, index.nodeById.get(topRound.target));
          addEdge(edgeIds, edges, topRound);
        }
      }
    }
  } else if (selected.kind === "year") {
    const yearRounds = graph.nodes
      .filter((node) => node.kind === "round" && String(node.year) === selected.label)
      .filter((round) => passesRoundScope(round, index, years, countries, confidence))
      .sort((left, right) => Number(right.amount_usd || 0) - Number(left.amount_usd || 0))
      .slice(0, isFreePreview ? 18 : 42);

    for (const round of yearRounds) {
      addNode(nodeIds, nodes, round);

      const raised = index.raisedByRound.get(round.id);
      const startup = raised ? index.nodeById.get(raised.source) : undefined;
      addNode(nodeIds, nodes, startup);
      addEdge(edgeIds, edges, raised);

      if (expansion.investors) {
        for (const roundEdge of index.edgesByNode.get(round.id) || []) {
          if (roundEdge.kind !== "participated") continue;
          addNode(nodeIds, nodes, index.nodeById.get(roundEdge.source));
          addEdge(edgeIds, edges, roundEdge);
        }
      }

      if (startup && expansion.geography) {
        for (const startupEdge of index.edgesByNode.get(startup.id) || []) {
          if (startupEdge.kind !== "headquartered_in" && startupEdge.kind !== "operates_in") continue;
          addNode(nodeIds, nodes, index.nodeById.get(otherEnd(startupEdge, startup.id)));
          addEdge(edgeIds, edges, startupEdge);
        }
      }
    }
  }

  return { nodes, edges };
}

function lanePosition(index: number, total: number, x: number, gap = 86): { x: number; y: number } {
  return { x, y: (index - (total - 1) / 2) * gap };
}

function radialPosition(index: number, total: number, radius: number, start = -Math.PI / 2): { x: number; y: number } {
  const angle = start + (index / Math.max(total, 1)) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function radialOverviewPositions(
  nodes: MarketNode[],
  edges: MarketEdge[],
  selectedId: string,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const ranked = [...nodes].sort((left, right) => signal(right) - signal(left));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) || []), edge.source]);
  });

  const depthById = new Map<string, number>([[selectedId, 0]]);
  const queue = [selectedId];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const depth = depthById.get(current) || 0;
    for (const next of adjacency.get(current) || []) {
      if (depthById.has(next)) continue;
      depthById.set(next, depth + 1);
      queue.push(next);
    }
  }

  const kindOffset: Record<NodeKind, number> = {
    startup: 0.15,
    round: 0.75,
    investor: 1.55,
    country: 2.35,
    domain: 2.9,
    region: 3.35,
    year: 3.75,
  };

  positions.set(selectedId, { x: 0, y: 0 });
  const groups = new Map<string, MarketNode[]>();
  ranked
    .filter((node) => node.id !== selectedId)
    .forEach((node) => {
      const depth = Math.min(depthById.get(node.id) || 4, 4);
      const key = `${depth}:${node.kind}`;
      groups.set(key, [...(groups.get(key) || []), node]);
    });

  groups.forEach((group, key) => {
    const [depthText, kind] = key.split(":") as [string, NodeKind];
    const depth = Number(depthText);
    const radius = 220 + (depth - 1) * 170;
    group.forEach((node, index) => {
      const spread = Math.PI * 1.55;
      const base = kindOffset[kind];
      const angle = base + (index - (group.length - 1) / 2) * (spread / Math.max(group.length, 1));
      positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  });

  return positions;
}

function flowPositions(nodes: MarketNode[], edges: MarketEdge[], selectedId: string): Map<string, { x: number; y: number }> {
  const selected = nodes.find((node) => node.id === selectedId);
  const positions = new Map<string, { x: number; y: number }>();
  const ranked = [...nodes].sort((left, right) => signal(right) - signal(left));
  const byKind = (kind: NodeKind) => ranked.filter((node) => node.kind === kind && node.id !== selectedId);
  const connectedTo = (nodeId: string, edgeKind?: string) =>
    edges.some((edge) => (edge.source === nodeId || edge.target === nodeId) && (!edgeKind || edge.kind === edgeKind));

  positions.set(selectedId, { x: 0, y: 0 });

  if (selected?.kind === "startup") {
    const rounds = byKind("round");
    const investors = byKind("investor");
    const context = ranked.filter(
      (node) => ["country", "domain", "region", "year"].includes(node.kind) && node.id !== selectedId,
    );
    const peers = byKind("startup");
    rounds.forEach((node, index) => positions.set(node.id, lanePosition(index, rounds.length, 270, 92)));
    investors.forEach((node, index) => positions.set(node.id, lanePosition(index, investors.length, 560, 64)));
    context.forEach((node, index) => positions.set(node.id, lanePosition(index, context.length, -250, 90)));
    peers.forEach((node, index) => positions.set(node.id, lanePosition(index, peers.length, -520, 76)));
  } else if (selected?.kind === "investor") {
    const rounds = byKind("round");
    const startups = byKind("startup");
    const context = ranked.filter((node) => ["country", "domain"].includes(node.kind) && node.id !== selectedId);
    rounds.forEach((node, index) => positions.set(node.id, lanePosition(index, rounds.length, 260, 88)));
    startups.forEach((node, index) => positions.set(node.id, lanePosition(index, startups.length, 540, 78)));
    context.forEach((node, index) => positions.set(node.id, lanePosition(index, context.length, -250, 90)));
  } else if (selected?.kind === "domain" || selected?.kind === "country") {
    const startups = byKind("startup");
    const rounds = byKind("round");
    const investors = byKind("investor");
    startups.forEach((node, index) => positions.set(node.id, lanePosition(index, startups.length, 270, 72)));
    rounds.forEach((node, index) => positions.set(node.id, lanePosition(index, rounds.length, 545, 76)));
    investors.forEach((node, index) => positions.set(node.id, lanePosition(index, investors.length, 820, 62)));
  } else if (selected?.kind === "round") {
    const startups = byKind("startup");
    const investors = byKind("investor");
    const context = ranked.filter((node) => ["country", "domain", "year"].includes(node.kind) && node.id !== selectedId);
    startups.forEach((node, index) => positions.set(node.id, lanePosition(index, startups.length, -260, 90)));
    investors.forEach((node, index) => positions.set(node.id, lanePosition(index, investors.length, 300, 64)));
    context.forEach((node, index) => positions.set(node.id, lanePosition(index, context.length, 560, 80)));
  }

  const unplaced = ranked.filter((node) => !positions.has(node.id));
  unplaced.forEach((node, index) => {
    const radius = connectedTo(node.id) ? 660 : 780;
    positions.set(node.id, radialPosition(index, unplaced.length, radius));
  });

  return positions;
}

function buildPositions(
  nodes: MarketNode[],
  edges: MarketEdge[],
  selectedId: string,
  layoutMode: LayoutMode,
): Map<string, { x: number; y: number }> {
  return layoutMode === "network" ? radialOverviewPositions(nodes, edges, selectedId) : flowPositions(nodes, edges, selectedId);
}

function buildElements(
  nodes: MarketNode[],
  edges: MarketEdge[],
  selectedId: string,
  layoutMode: LayoutMode,
): ElementDefinition[] {
  const ranked = [...nodes].sort((left, right) => signal(right) - signal(left));
  const positions = buildPositions(nodes, edges, selectedId, layoutMode);

  const topLabels = new Set(ranked.slice(0, 60).map((node) => node.id));
  topLabels.add(selectedId);

  return [
    ...nodes.map((node) => ({
      group: "nodes" as const,
      data: {
        id: node.id,
        label: node.label,
        displayLabel: topLabels.has(node.id) ? node.label : "",
        kind: node.kind,
        selected: node.id === selectedId ? "yes" : "no",
        weight: signal(node),
      },
      position: positions.get(node.id),
    })),
    ...edges.map((edge) => ({
      group: "edges" as const,
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
        role: edge.role || "",
        mode: layoutMode,
      },
    })),
  ];
}

function GraphView({
  selectedId,
  nodes,
  edges,
  layoutMode,
  themeMode,
  viewportSignal,
  onSelect,
}: {
  selectedId: string;
  nodes: MarketNode[];
  edges: MarketEdge[];
  layoutMode: LayoutMode;
  themeMode: ThemeMode;
  viewportSignal: string;
  onSelect: (node: MarketNode | undefined) => void;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [containerReady, setContainerReady] = useState(false);
  const [hovered, setHovered] = useState<{ node: MarketNode; x: number; y: number } | null>(null);
  const cyRef = useRef<Core | null>(null);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeByIdRef = useRef(nodeById);

  useEffect(() => {
    nodeByIdRef.current = nodeById;
  }, [nodeById]);

  useEffect(() => {
    if (!container) return;
    const updateReady = () => {
      const rect = container.getBoundingClientRect();
      setContainerReady(rect.width > 80 && rect.height > 80);
    };
    const resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(updateReady));
    resizeObserver.observe(container);
    const frame = window.requestAnimationFrame(updateReady);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [container]);

  useEffect(() => {
    if (!containerReady) {
      cyRef.current?.destroy();
      cyRef.current = null;
    }
  }, [containerReady]);

  useEffect(() => {
    if (cyRef.current || !containerReady) return;
    if (!container) return;
    const theme = graphThemeColors[themeMode];
    const palette = nodeColors[themeMode];
    const cy = cytoscape({
      container,
      elements: [],
      layout: { name: "preset", fit: true, padding: 48 },
      minZoom: 0.08,
      maxZoom: 3.4,
      wheelSensitivity: 0.32,
      hideEdgesOnViewport: true,
      textureOnViewport: true,
      style: [
        {
          selector: "node",
          style: {
            label: "data(displayLabel)",
            "background-color": (element: NodeSingular) => palette[element.data("kind") as NodeKind],
            color: theme.label,
            "font-size": 9,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 7,
            width: (element: NodeSingular) =>
              Math.min(58, Math.max(10, Math.sqrt(Number(element.data("weight")) / 90_000_000))),
            height: (element: NodeSingular) =>
              Math.min(58, Math.max(10, Math.sqrt(Number(element.data("weight")) / 90_000_000))),
            "border-width": 1.2,
            "border-color": theme.outline,
            "active-bg-color": themeMode === "dark" ? "#b7bfbd" : theme.selected,
            "active-bg-opacity": themeMode === "dark" ? 0.34 : 0.2,
            "active-bg-size": 48,
            "text-outline-color": theme.outline,
            "text-outline-width": 2,
          },
        },
        {
          selector: 'node[selected = "yes"]',
          style: {
            width: 76,
            height: 76,
            "border-width": 4,
            "border-color": theme.selected,
            label: "data(label)",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": theme.baseEdge,
            "curve-style": "bezier",
            "control-point-step-size": 28,
            "target-arrow-color": theme.baseEdge,
            "target-arrow-shape": "none",
            opacity: 0.3,
          },
        },
        {
          selector: 'edge[mode = "network"]',
          style: {
            "curve-style": "straight",
            "target-arrow-shape": "none",
            opacity: 0.2,
            width: 0.85,
          },
        },
        {
          selector: 'edge[kind = "participated"]',
          style: {
            "line-color": theme.investorEdge,
            "target-arrow-color": theme.investorEdge,
            "target-arrow-shape": "triangle",
            opacity: 0.46,
          },
        },
        {
          selector: 'edge[mode = "network"][kind = "participated"]',
          style: {
            opacity: 0.28,
            width: 0.9,
          },
        },
        {
          selector: 'edge[kind = "raised"]',
          style: {
            "line-color": theme.raisedEdge,
            "target-arrow-color": theme.raisedEdge,
            "target-arrow-shape": "triangle",
            width: 2.2,
            opacity: 0.78,
          },
        },
        {
          selector: 'edge[mode = "network"][kind = "raised"]',
          style: {
            "target-arrow-shape": "triangle",
            opacity: 0.72,
            width: 1.8,
          },
        },
        {
          selector: 'edge[kind = "operates_in"], edge[kind = "headquartered_in"]',
          style: {
            "line-color": theme.contextEdge,
            "line-style": "dashed",
            "target-arrow-color": theme.contextEdge,
            "target-arrow-shape": "triangle",
            width: 1.45,
            opacity: 0.56,
          },
        },
        {
          selector: 'edge[mode = "network"][kind = "operates_in"], edge[mode = "network"][kind = "headquartered_in"]',
          style: {
            "target-arrow-shape": "none",
            opacity: 0.42,
            width: 1.15,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 4,
            "border-color": theme.selected,
            label: "data(label)",
          },
        },
      ],
    });
    cyRef.current = cy;

    cy.on("tap", "node", (event) => {
      onSelect(nodeByIdRef.current.get(event.target.id()));
    });
    cy.on("mouseover", "node", (event) => {
      const node = nodeByIdRef.current.get(event.target.id());
      if (!node) return;
      const position = event.renderedPosition || { x: 0, y: 0 };
      setHovered({ node, x: position.x, y: position.y });
    });
    cy.on("mousemove", "node", (event) => {
      const node = nodeByIdRef.current.get(event.target.id());
      if (!node) return;
      const position = event.renderedPosition || { x: 0, y: 0 };
      setHovered({ node, x: position.x, y: position.y });
    });
    cy.on("mouseout", "node", () => setHovered(null));

    const resize = () => {
      cy.resize();
      cy.fit(undefined, 54);
    };
    const resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(resize));
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      cy.destroy();
      cyRef.current = null;
    };
  }, [container, containerReady, onSelect, themeMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(buildElements(nodes, edges, selectedId, layoutMode));
      cy.layout({ name: "preset", fit: false }).run();
    });
    const refresh = () => {
      cy.resize();
      cy.fit(undefined, 54);
      (cy as Core & { forceRender?: () => void }).forceRender?.();
    };
    const frame = window.requestAnimationFrame(() => {
      refresh();
      window.requestAnimationFrame(refresh);
    });
    const settleTimers = [80, 180, 360, 720].map((delay) => window.setTimeout(refresh, delay));
    return () => {
      window.cancelAnimationFrame(frame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [containerReady, edges, layoutMode, nodes, selectedId, viewportSignal]);

  return (
    <div className="graph-frame">
      <div className="graph-hud">
        <span>{formatCount(nodes.length)} entities</span>
        <span>{formatCount(edges.length)} relationships</span>
      </div>
      <div className="graph-legend" aria-label="Graph legend">
        {graphLegendKinds.map((kind) => (
          <span key={kind}>
            <i style={{ background: nodeColors[themeMode][kind] }} />
            {kindLabels[kind]}
          </span>
        ))}
      </div>
      <button
        className="graph-fit-button"
        onClick={() => {
          const cy = cyRef.current;
          if (!cy) return;
          cy.stop();
          cy.animate(
            {
              fit: { eles: cy.elements(), padding: 58 },
            },
            { duration: 220 },
          );
        }}
        aria-label="Fit graph to view"
        title="Fit graph to view"
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 4H4v4M4 4l6 6M16 4h4v4M20 4l-6 6M8 20H4v-4M4 20l6-6M16 20h4v-4M20 20l-6-6" />
        </svg>
      </button>
      {hovered ? (
        <div
          className="graph-hover-card"
          style={{
            left: Math.min(hovered.x + 16, Math.max(18, (container?.clientWidth || 360) - 260)),
            top: Math.min(hovered.y + 16, Math.max(18, (container?.clientHeight || 360) - 154)),
          }}
        >
          <span>{kindLabels[hovered.node.kind]}</span>
          <strong>{hovered.node.label}</strong>
          {hovered.node.country ? <small>{hovered.node.country}</small> : null}
          {hovered.node.domain ? <small>{hovered.node.domain}</small> : null}
          {hovered.node.amount_usd ? <small>{formatUsd(Number(hovered.node.amount_usd))}</small> : null}
          {hovered.node.visible_mega_round_funding_usd ? (
            <small>{formatUsd(Number(hovered.node.visible_mega_round_funding_usd))} visible funding</small>
          ) : null}
        </div>
      ) : null}
      <div className="graph-canvas" ref={setContainer} />
    </div>
  );
}

function SearchPanel({
  graph,
  selected,
  onSelect,
}: {
  graph: MarketGraph;
  selected?: MarketNode;
  onSelect: (node: MarketNode) => void;
}) {
  const [query, setQuery] = useState("");
  const searchable = useMemo(
    () =>
      graph.nodes
        .filter((node) => ["startup", "investor", "country", "domain"].includes(node.kind))
        .sort((left, right) => signal(right) - signal(left)),
    [graph.nodes],
  );

  const results = searchable
    .filter((node) => node.label.toLowerCase().includes(query.toLowerCase().trim()))
    .slice(0, query ? 16 : 10);

  return (
    <section className="command-panel">
      <div className="command-label">Entity lookup</div>
      <input
        className="command-input"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) {
            onSelect(results[0]);
            setQuery("");
          }
        }}
        placeholder="Find company, investor, country, domain..."
        value={query}
      />
      <div className="result-list">
        {results.map((node) => (
          <button
            className={selected?.id === node.id ? "result-row active" : "result-row"}
            key={node.id}
            onClick={() => {
              onSelect(node);
              setQuery("");
            }}
            type="button"
          >
            <span>{node.label}</span>
            <small>{kindLabels[node.kind]}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuickSearch({
  graph,
  onSelect,
}: {
  graph: MarketGraph;
  onSelect: (node: MarketNode) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchable = useMemo(
    () =>
      graph.nodes
        .filter((node) => ["startup", "investor", "country", "domain"].includes(node.kind))
        .sort((left, right) => signal(right) - signal(left)),
    [graph.nodes],
  );
  const results = searchable
    .filter((node) => node.label.toLowerCase().includes(query.toLowerCase().trim()))
    .slice(0, query ? 8 : 5);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectResult = (node: MarketNode | undefined) => {
    if (!node) return;
    onSelect(node);
    setQuery("");
    setFocused(false);
  };

  return (
    <div className="quick-search">
      <input
        aria-label="Search graph entities"
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setFocused(true);
            setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if ((event.key === "Enter" || event.key === "Tab") && results[activeIndex]) {
            event.preventDefault();
            selectResult(results[activeIndex]);
          }
        }}
        placeholder="Search entities..."
        value={query}
      />
      {focused && results.length ? (
        <div className="quick-results">
          {results.map((node) => (
            <button
              className={results[activeIndex]?.id === node.id ? "active" : ""}
              key={node.id}
              onMouseDown={() => selectResult(node)}
              onMouseEnter={() => setActiveIndex(results.findIndex((result) => result.id === node.id))}
              type="button"
            >
              <span>{node.label}</span>
              <small>{kindLabels[node.kind]}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HighLevelFilters({
  graph,
  years,
  countries,
  confidence,
  setYears,
  setCountries,
  setConfidence,
}: {
  graph: MarketGraph;
  years: string[];
  countries: string[];
  confidence: string[];
  setYears: (years: string[]) => void;
  setCountries: (countries: string[]) => void;
  setConfidence: (confidence: string[]) => void;
}) {
  const confidenceValue =
    confidence.length === graph.facets.confidence.length ? "__all__" : confidence[0] || "__all__";
  const countryValue =
    countries.length === graph.facets.countries.length ? "__all__" : countries[0] || "__all__";
  return (
    <aside className="graph-filter-panel" aria-label="Graph filters">
      <label>
        <span>Year</span>
        <select
          onChange={(event) => {
            const value = event.target.value;
            setYears(value === "__all__" ? graph.facets.years : [value]);
          }}
          value={years.length === graph.facets.years.length ? "__all__" : years[0] || "__all__"}
        >
          <option value="__all__">All years</option>
          {graph.facets.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Country</span>
        <select
          onChange={(event) => {
            const value = event.target.value;
            setCountries(value === "__all__" ? graph.facets.countries : [value]);
          }}
          value={countryValue}
        >
          <option value="__all__">All countries</option>
          {graph.facets.countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Confidence</span>
        <select
          onChange={(event) => {
            const value = event.target.value;
            setConfidence(value === "__all__" ? graph.facets.confidence : [value]);
          }}
          title={confidenceValue === "__all__" ? "All source confidence levels" : confidenceHelp[confidenceValue]}
          value={confidenceValue}
        >
          <option value="__all__">All evidence</option>
          {graph.facets.confidence.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}

function DomainNavigator({
  graph,
  onSelect,
}: {
  graph: MarketGraph;
  onSelect: (node: MarketNode) => void;
}) {
  const domains = useMemo(() => {
    return graph.nodes
      .filter((node) => node.kind === "domain")
      .map((domain) => {
        const companies = graph.nodes.filter((node) => node.kind === "startup" && node.domain === domain.label);
        const funding = companies.reduce((sum, company) => sum + Number(company.visible_mega_round_funding_usd || 0), 0);
        return { domain, companies: companies.length, funding };
      })
      .sort((left, right) => right.funding - left.funding)
      .slice(0, 10);
  }, [graph.nodes]);

  return (
    <aside className="domain-navigator" aria-label="AI domains">
      <div className="domain-nav-title">Domains</div>
      <div className="domain-list">
        {domains.map(({ domain, companies, funding }) => (
          <button key={domain.id} onClick={() => onSelect(domain)} type="button">
            <span>{domain.label}</span>
            <small>
              {formatUsd(funding)} · {formatCount(companies)}
            </small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ExpansionControls({
  expansion,
  setExpansion,
}: {
  expansion: Expansion;
  setExpansion: (expansion: Expansion) => void;
}) {
  const controls: Array<[keyof Expansion, string]> = [
    ["rounds", "Funding events"],
    ["investors", "Investors"],
    ["geography", "Country/domain"],
    ["peers", "Peers"],
  ];
  return (
    <section className="filter-block">
      <div className="filter-title">Expand neighborhood</div>
      <div className="chip-row">
        {controls.map(([key, label]) => (
          <button
            className={expansion[key] ? "chip selected" : "chip"}
            key={key}
            onClick={() => setExpansion({ ...expansion, [key]: !expansion[key] })}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function FilterChips({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <section className="filter-block">
      <div className="filter-title">{title}</div>
      <div className="chip-row">
        {values.map((value) => (
          <button
            className={selected.includes(value) ? "chip selected" : "chip"}
            key={value}
            onClick={() =>
              onToggle(selected.includes(value) && selected.length === 1 ? value : value)
            }
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
    </section>
  );
}

function EntityProfile({ node }: { node?: MarketNode }) {
  if (!node) return null;
  const value = Number(
    node.visible_mega_round_funding_usd || node.linked_funding_usd || node.amount_usd || node.funding_usd || 0,
  );
  return (
    <section className="entity-profile">
      <div className="profile-heading">
        <div>
          <span>{kindLabels[node.kind]}</span>
          <h2>{node.label}</h2>
        </div>
        <div className="profile-actions">
          {node.website ? (
            <a aria-label="Open company site" href={node.website} rel="noreferrer" target="_blank">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M7 17 17 7M9 7h8v8" />
                <path d="M19 13v6H5V5h6" />
              </svg>
            </a>
          ) : null}
          {node.source_url ? (
            <a aria-label="Open funding source" href={node.source_url} rel="noreferrer" target="_blank">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M14 3h7v7M10 14 21 3" />
                <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
              </svg>
            </a>
          ) : null}
        </div>
      </div>
      <div className="detail-grid">
        {value ? (
          <div>
            <span>Funding</span>
            <strong>{formatUsd(value)}</strong>
          </div>
        ) : null}
        {node.region ? (
          <div>
            <span>Region</span>
            <strong>{node.region}</strong>
          </div>
        ) : null}
        {node.country ? (
          <div>
            <span>Country</span>
            <strong>{node.country}</strong>
          </div>
        ) : null}
        {node.domain ? (
          <div>
            <span>Domain</span>
            <strong>{node.domain}</strong>
          </div>
        ) : null}
        {node.confidence ? (
          <div>
            <span>Confidence</span>
            <strong>{node.confidence}</strong>
          </div>
        ) : null}
        {node.mega_round_count ? (
          <div>
            <span>Mega-rounds</span>
            <strong>{formatCount(Number(node.mega_round_count))}</strong>
          </div>
        ) : null}
        {node.participated_rounds ? (
          <div>
            <span>Participated rounds</span>
            <strong>{formatCount(Number(node.participated_rounds))}</strong>
          </div>
        ) : null}
        {node.lead_rounds ? (
          <div>
            <span>Lead rounds</span>
            <strong>{formatCount(Number(node.lead_rounds))}</strong>
          </div>
        ) : null}
      </div>
      {node.notable_products ? <p>{node.notable_products}</p> : null}
    </section>
  );
}

function NeighborhoodMetrics({ nodes, edges }: { nodes: MarketNode[]; edges: MarketEdge[] }) {
  const rounds = nodes.filter((node) => node.kind === "round");
  const investors = nodes.filter((node) => node.kind === "investor");
  const startups = nodes.filter((node) => node.kind === "startup");
  const funding = rounds.reduce((sum, node) => sum + Number(node.amount_usd || 0), 0);
  return (
    <div className="metrics-grid compact">
      <div className="metric">
        <span>Local funding</span>
        <strong>{formatUsd(funding)}</strong>
      </div>
      <div className="metric">
        <span>Entities</span>
        <strong>{formatCount(nodes.length)}</strong>
      </div>
      <div className="metric">
        <span>Companies</span>
        <strong>{formatCount(startups.length)}</strong>
      </div>
      <div className="metric">
        <span>Investors</span>
        <strong>{formatCount(investors.length)}</strong>
      </div>
      <div className="metric">
        <span>Events</span>
        <strong>{formatCount(rounds.length)}</strong>
      </div>
      <div className="metric">
        <span>Links</span>
        <strong>{formatCount(edges.length)}</strong>
      </div>
    </div>
  );
}

function EvidenceTable({ nodes }: { nodes: MarketNode[] }) {
  const rounds = nodes
    .filter((node) => node.kind === "round")
    .sort((left, right) => Number(right.amount_usd || 0) - Number(left.amount_usd || 0))
    .slice(0, 12);
  return (
    <section className="panel-block">
      <h2>Evidence events</h2>
      <div className="evidence-list">
        {rounds.map((round) => (
          <a className="evidence-row" href={round.source_url} key={round.id} rel="noreferrer" target="_blank">
            <span>{round.label}</span>
            <strong>{formatUsd(Number(round.amount_usd || 0))}</strong>
            <small>{round.year} · {round.confidence}</small>
          </a>
        ))}
        {!rounds.length ? <p>No funding events are visible in this neighborhood.</p> : null}
      </div>
    </section>
  );
}

function DetailContext({ nodes, edges }: { nodes: MarketNode[]; edges: MarketEdge[] }) {
  const rounds = nodes.filter((node) => node.kind === "round");
  const investors = nodes.filter((node) => node.kind === "investor");
  const companies = nodes.filter((node) => node.kind === "startup");
  const funding = rounds.reduce((sum, node) => sum + Number(node.amount_usd || 0), 0);
  return (
    <section className="context-strip" aria-label="Visible neighborhood context">
      <div>
        <span>Visible capital</span>
        <strong>{formatUsd(funding)}</strong>
      </div>
      <div>
        <span>Events</span>
        <strong>{formatCount(rounds.length)}</strong>
      </div>
      <div>
        <span>Companies</span>
        <strong>{formatCount(companies.length)}</strong>
      </div>
      <div>
        <span>Investors</span>
        <strong>{formatCount(investors.length)}</strong>
      </div>
    </section>
  );
}

function renderInlineMarkdown(text: string) {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  return text.split(tokenPattern).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a href={link[2]} key={`${part}-${index}`} rel="noreferrer" target="_blank">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function AssistantMessage({ content }: { content: string }) {
  const blocks: JSX.Element[] = [];
  const lines = content.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>);
    blocks.push(listType === "ol" ? <ol key={`list-${blocks.length}`}>{items}</ol> : <ul key={`list-${blocks.length}`}>{items}</ul>);
    listItems = [];
    listType = null;
  };

  lines.forEach((line) => {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+\.\s+(.+)$/);

    if (heading) {
      flushList();
      blocks.push(<h4 key={`heading-${blocks.length}`}>{renderInlineMarkdown(heading[1])}</h4>);
      return;
    }
    if (bullet || numbered) {
      const nextType = bullet ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((bullet || numbered)?.[1] || line);
      return;
    }

    flushList();
    blocks.push(<p key={`paragraph-${blocks.length}`}>{renderInlineMarkdown(line)}</p>);
  });
  flushList();

  return <div className="assistant-formatted">{blocks}</div>;
}

function AskPanel({
  selected,
  nodes,
  edges,
  session,
  onLoginRequired,
  onOpenAccount,
}: {
  selected: MarketNode;
  nodes: MarketNode[];
  edges: MarketEdge[];
  session: SupabaseSession | null;
  onLoginRequired: () => void;
  onOpenAccount: () => void;
}) {
  const [askToken, setAskToken] = useState(() => localStorage.getItem("ask_access_token") || "");
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const useSupabaseAuth = Boolean(supabase);
  const authToken = useSupabaseAuth ? session?.access_token || "" : askToken.trim();
  const isLocalDevMode = usage?.user_id === "local_dev";
  const creditsRemaining = Number(usage?.credits_remaining || 0);
  const creditsPerPrompt = Number(usage?.credits_per_prompt || 1);
  const hasCredits = isLocalDevMode || !usage || creditsRemaining >= creditsPerPrompt;
  const requiresTopUp = useSupabaseAuth && Boolean(session) && usage !== null && !hasCredits;

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (authToken) headers["x-ask-token"] = authToken;
    fetch("/api/ask/usage", { headers })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.usage) setUsage(payload.usage);
      })
      .catch(() => undefined);
  }, [authToken]);

  const updateAskToken = (value: string) => {
    setAskToken(value);
    if (value.trim()) {
      localStorage.setItem("ask_access_token", value.trim());
    } else {
      localStorage.removeItem("ask_access_token");
      setUsage(null);
    }
  };

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || status === "loading") return;
    if (useSupabaseAuth && !session) {
      onLoginRequired();
      return;
    }
    if (requiresTopUp) {
      setStatus("error");
      setError("No Ask allowance remaining. Open your profile to review plan options.");
      return;
    }
    setStatus("loading");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setQuestion("");
    setError("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "x-ask-token": authToken } : {}),
        },
        body: JSON.stringify({
          question: trimmed,
          messages,
          selected,
          neighborhood: {
            nodes: nodes.slice(0, 80),
            edges: edges.slice(0, 140),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The graph assistant is not available.");
      if (payload.usage) setUsage(payload.usage);
      setMessages((current) => [...current, { role: "assistant", content: payload.answer }]);
      setStatus("idle");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "The graph assistant is not available.");
    }
  }

  return (
    <section className="ask-panel">
      {!useSupabaseAuth && !isLocalDevMode ? (
        <div className="ask-access compact">
          <label>
            <span>Ask access</span>
            <input
              autoComplete="off"
              onChange={(event) => updateAskToken(event.target.value)}
              placeholder="Access token"
              type="password"
              value={askToken}
            />
          </label>
        </div>
      ) : null}
      {requiresTopUp ? (
        <div className="ask-credit-notice depleted">
          <strong>No Ask access remaining.</strong>
          <span>Open your profile to review plan options and continue using the assistant.</span>
          <button onClick={onOpenAccount} type="button">Open profile</button>
        </div>
      ) : null}
      <div className="chat-thread">
        {messages.length ? (
          messages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" ? <AssistantMessage content={message.content} /> : message.content}
            </div>
          ))
        ) : (
          <div className="chat-empty">Ask about the graph, the selected entity, or general AI market context.</div>
        )}
        {status === "loading" ? <div className="chat-message assistant">Thinking...</div> : null}
      </div>
      <div className="chat-composer">
        <textarea
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={requiresTopUp ? "Open your profile to review Ask plan options." : `Ask about ${selected.label}, this graph, or general market context...`}
          value={question}
        />
        <button
          className="send-button"
          disabled={status === "loading" || !question.trim() || requiresTopUp}
          onClick={ask}
          type="button"
        >
          {useSupabaseAuth && !session ? "Sign in" : "Send"}
        </button>
      </div>
      {status === "error" ? (
        <div className="assistant-error">
          {error}
          <br />
          Check that the Ask API is running and that the required server environment variables are configured.
        </div>
      ) : null}
    </section>
  );
}

function Ranking({
  title,
  nodes,
  kind,
  valueKey,
  onSelect,
}: {
  title: string;
  nodes: MarketNode[];
  kind: NodeKind;
  valueKey: "visible_mega_round_funding_usd" | "linked_funding_usd" | "amount_usd";
  onSelect: (node: MarketNode) => void;
}) {
  const rows = nodes
    .filter((node) => node.kind === kind)
    .sort((left, right) => Number(right[valueKey] || 0) - Number(left[valueKey] || 0))
    .slice(0, 8);
  return (
    <section className="panel-block">
      <h2>{title}</h2>
      <div className="ranking">
        {rows.map((node) => (
          <button className="rank-row" key={node.id} onClick={() => onSelect(node)} type="button">
            <span>{node.label}</span>
            <strong>{formatUsd(Number(node[valueKey] || 0))}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

type AnalyticsFilters = {
  years: string[];
  regions: string[];
  countries: string[];
  domains: string[];
  confidence: string[];
};

type AnalyticsMetric = "funding" | "events" | "companies" | "investors";
type AnalyticsBreakdown = "year" | "region" | "country" | "domain" | "confidence";
type AnalyticsRow = { id: string; label: string; value: number; node?: MarketNode; rounds?: MarketNode[] };

const metricLabels: Record<AnalyticsMetric, string> = {
  funding: "Funding",
  events: "Events",
  companies: "Companies",
  investors: "Investors",
};

const breakdownLabels: Record<AnalyticsBreakdown, string> = {
  year: "Year",
  region: "Region",
  country: "Country",
  domain: "Domain",
  confidence: "Evidence",
};

function AnalyticsSelect({
  label,
  selected,
  values,
  onChange,
}: {
  label: string;
  selected: string[];
  values: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const allSelected = selected.length === values.length;
  const selectionLabel = allSelected
    ? "All"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current && target && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  const toggleValue = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(next.length ? next : values);
  };
  return (
    <div ref={wrapperRef} className="analytics-select">
      <span>{label}</span>
      <button
        aria-expanded={open}
        className="analytics-multi-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {selectionLabel}
      </button>
      {open ? (
        <div className="analytics-multi-menu">
          <div className="analytics-multi-actions">
            <button onClick={() => onChange(values)} type="button">All</button>
            <button onClick={() => onChange(values.slice(0, 1))} type="button">One</button>
          </div>
          <div className="analytics-multi-options">
            {values.map((item) => (
              <label key={item}>
                <input
                  checked={selected.includes(item)}
                  onChange={() => toggleValue(item)}
                  type="checkbox"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SinglePopoverSelect({
  label,
  value,
  values,
  onChange,
  formatValue = (item: string) => item,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  formatValue?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const options = ["__all__", ...values];
  const selectionLabel = value === "__all__" ? "All" : formatValue(value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current && target && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="analytics-select">
      <span>{label}</span>
      <button
        aria-expanded={open}
        className="analytics-multi-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {selectionLabel}
      </button>
      {open ? (
        <div className="analytics-multi-menu single-select-menu">
          <div className="analytics-multi-options">
            {options.map((item) => (
              <button
                className={item === value ? "selected" : ""}
                key={item}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
                type="button"
              >
                {item === "__all__" ? "All" : formatValue(item)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function horizontalBars({
  rows,
  valueFormatter,
  onSelect,
  onSelectRow,
  selectedId,
}: {
  rows: AnalyticsRow[];
  valueFormatter?: (value: number) => string;
  onSelect?: (node: MarketNode) => void;
  onSelectRow?: (row: AnalyticsRow) => void;
  selectedId?: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="bar-list">
      {rows.map((row) => (
        <button
          className={[
            "bar-row",
            row.node && onSelect ? "clickable" : "",
            onSelectRow ? "clickable" : "",
            selectedId === row.id ? "selected" : "",
          ].join(" ")}
          disabled={!(row.node && onSelect) && !onSelectRow}
          key={row.id}
          onClick={() => {
            if (row.node && onSelect) onSelect(row.node);
            else onSelectRow?.(row);
          }}
          type="button"
        >
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
          </div>
          <strong>{valueFormatter ? valueFormatter(row.value) : formatCount(row.value)}</strong>
        </button>
      ))}
    </div>
  );
}

function AnalyticsPage({
  graph,
  filters,
  setFilters,
  onSelectNode,
  onSelectRound,
  onSelectSlice,
  isFreePreview,
  onUpgrade,
}: {
  graph: MarketGraph;
  filters: AnalyticsFilters;
  setFilters: (filters: AnalyticsFilters) => void;
  onSelectNode: (node: MarketNode) => void;
  onSelectRound: (node: MarketNode) => void;
  onSelectSlice: (kind: AnalyticsBreakdown, label: string) => void;
  isFreePreview: boolean;
  onUpgrade: (prompt: UpgradePrompt) => void;
}) {
  const [activeSlice, setActiveSlice] = useState<{ kind: AnalyticsBreakdown; label: string } | null>(null);
  const [breakdown, setBreakdown] = useState<AnalyticsBreakdown>("domain");

  const roundToStartup = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const mapping = new Map<string, MarketNode>();
    graph.edges.forEach((edge) => {
      if (edge.kind !== "raised") return;
      const startup = byId.get(edge.source);
      if (startup?.kind === "startup") mapping.set(edge.target, startup);
    });
    return mapping;
  }, [graph.edges, graph.nodes]);

  const investorByRound = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const mapping = new Map<string, MarketNode[]>();
    graph.edges.forEach((edge) => {
      if (edge.kind !== "participated") return;
      const investor = byId.get(edge.source);
      if (investor?.kind !== "investor") return;
      mapping.set(edge.target, [...(mapping.get(edge.target) || []), investor]);
    });
    return mapping;
  }, [graph.edges, graph.nodes]);

  const filteredRounds = useMemo(() => {
    return graph.nodes
      .filter((node) => node.kind === "round")
      .filter((round) => {
        const startup = roundToStartup.get(round.id);
        if (round.year && !filters.years.includes(String(round.year))) return false;
        if (round.confidence && !filters.confidence.includes(round.confidence)) return false;
        if (startup?.region && !filters.regions.includes(startup.region)) return false;
        if (startup?.country && !filters.countries.includes(startup.country)) return false;
        if (startup?.domain && !filters.domains.includes(startup.domain)) return false;
        return true;
      });
  }, [filters, graph.nodes, roundToStartup]);

  const filteredStartups = useMemo(() => {
    const ids = new Set(filteredRounds.map((round) => roundToStartup.get(round.id)?.id).filter(Boolean));
    return graph.nodes.filter((node) => node.kind === "startup" && ids.has(node.id));
  }, [filteredRounds, graph.nodes, roundToStartup]);

  const roundIds = new Set(filteredRounds.map((round) => round.id));
  const investorIds = new Set(
    graph.edges.filter((edge) => edge.kind === "participated" && roundIds.has(edge.target)).map((edge) => edge.source),
  );
  const visibleInvestors = graph.nodes.filter((node) => node.kind === "investor" && investorIds.has(node.id));
  const totalFunding = filteredRounds.reduce((sum, round) => sum + Number(round.amount_usd || 0), 0);

  useEffect(() => {
    setActiveSlice(null);
  }, [filters]);

  const segmentLabel = (round: MarketNode, key: AnalyticsBreakdown) => {
    const startup = roundToStartup.get(round.id);
    if (key === "year") return String(round.year || "Unknown");
    if (key === "confidence") return String(round.confidence || "Unknown");
    return String(startup?.[key] || "Unknown");
  };

  const aggregateFunding = (key: AnalyticsBreakdown): AnalyticsRow[] => {
    const grouped = new Map<string, MarketNode[]>();
    filteredRounds.forEach((round) => {
      const label = segmentLabel(round, key);
      grouped.set(label, [...(grouped.get(label) || []), round]);
    });
    return [...grouped.entries()]
      .map(([label, rounds]) => ({
        id: `${key}:${label}`,
        label,
        value: rounds.reduce((sum, round) => sum + Number(round.amount_usd || 0), 0),
        rounds,
      }))
      .sort((left, right) => right.value - left.value);
  };

  const activeRounds = activeSlice
    ? filteredRounds.filter((round) => segmentLabel(round, activeSlice.kind) === activeSlice.label)
    : filteredRounds;

  const activeTitle = activeSlice ? `${breakdownLabels[activeSlice.kind]}: ${activeSlice.label}` : "All visible events";
  const activeFunding = activeRounds.reduce((sum, round) => sum + Number(round.amount_usd || 0), 0);
  const activeCompanies = new Set(activeRounds.map((round) => roundToStartup.get(round.id)?.id).filter(Boolean)).size;
  const activeInvestors = new Set(
    activeRounds.flatMap((round) => (investorByRound.get(round.id) || []).map((node) => node.id)),
  ).size;

  const breakdownRows = aggregateFunding(breakdown).slice(0, breakdown === "country"
    ? graph.facets.countries.length
    : isFreePreview
      ? FREE_PREVIEW_LIMITS.analyticsBars
      : 10);

  const companyFunding = new Map<string, { node: MarketNode; value: number }>();
  filteredRounds.forEach((round) => {
    const startup = roundToStartup.get(round.id);
    if (!startup) return;
    const current = companyFunding.get(startup.id)?.value || 0;
    companyFunding.set(startup.id, { node: startup, value: current + Number(round.amount_usd || 0) });
  });

  const investorFunding = new Map<string, { node: MarketNode; value: number }>();
  filteredRounds.forEach((round) => {
    (investorByRound.get(round.id) || []).forEach((investor) => {
      const current = investorFunding.get(investor.id)?.value || 0;
      investorFunding.set(investor.id, { node: investor, value: current + Number(round.amount_usd || 0) });
    });
  });

  const topCompanies = [...companyFunding.values()]
    .sort((left, right) => right.value - left.value)
    .slice(0, isFreePreview ? FREE_PREVIEW_LIMITS.analyticsBars : 8)
    .map(({ node, value }) => ({
      id: node.id,
      label: node.label,
      value,
      node,
    }));

  const topInvestors = [...investorFunding.values()]
    .sort((left, right) => right.value - left.value)
    .slice(0, isFreePreview ? FREE_PREVIEW_LIMITS.analyticsBars : 8)
    .map(({ node, value }) => ({
      id: node.id,
      label: node.label,
      value,
      node,
    }));

  const evidenceRows = [...activeRounds]
    .sort((left, right) => Number(right.amount_usd || 0) - Number(left.amount_usd || 0))
    .slice(0, isFreePreview ? FREE_PREVIEW_LIMITS.analyticsEvidenceRows : 14);
  const evidenceLimit = evidenceRows.length;
  const hasLockedAnalyticsRows = isFreePreview && activeRounds.length > evidenceRows.length;
  const openAnalyticsUpgrade = () => onUpgrade({
    feature: "Full analytics",
    title: "Unlock the complete market view",
    body: "Starter opens the full rankings, deeper slices, and the complete evidence table so investors can move past the preview.",
  });

  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <div className="eyebrow">Market dashboard</div>
          <h1>AI funding growth</h1>
        </div>
        <div className="analytics-filters">
          <AnalyticsSelect
            label="Year"
            onChange={(values) => setFilters({ ...filters, years: values })}
            selected={filters.years}
            values={graph.facets.years}
          />
          <AnalyticsSelect
            label="Region"
            onChange={(values) => setFilters({ ...filters, regions: values })}
            selected={filters.regions}
            values={graph.facets.regions}
          />
          <AnalyticsSelect
            label="Country"
            onChange={(values) => setFilters({ ...filters, countries: values })}
            selected={filters.countries}
            values={graph.facets.countries}
          />
          <AnalyticsSelect
            label="Domain"
            onChange={(values) => setFilters({ ...filters, domains: values })}
            selected={filters.domains}
            values={graph.facets.domains}
          />
          <AnalyticsSelect
            label="Evidence"
            onChange={(values) => setFilters({ ...filters, confidence: values })}
            selected={filters.confidence}
            values={graph.facets.confidence}
          />
        </div>
      </header>

      <section className="analytics-kpis">
        <div>
          <span>Visible funding</span>
          <strong>{formatUsd(totalFunding)}</strong>
        </div>
        <div>
          <span>Funding events</span>
          <strong>{formatCount(filteredRounds.length)}</strong>
        </div>
        <div>
          <span>Companies</span>
          <strong>{formatCount(filteredStartups.length)}</strong>
        </div>
        <div>
          <span>Investors</span>
          <strong>{formatCount(visibleInvestors.length)}</strong>
        </div>
      </section>

      <section className="analytics-grid">
        <article className="analytics-card wide">
          <div className="card-heading">
            <h2>Market concentration</h2>
            {activeSlice ? (
              <button onClick={() => setActiveSlice(null)} type="button">Clear slice</button>
            ) : null}
          </div>
          <div className="segmented-control" aria-label="Analytics breakdown">
            {(["domain", "country", "year", "confidence"] as AnalyticsBreakdown[]).map((item) => (
              <button
                className={breakdown === item ? "active" : ""}
                key={item}
                onClick={() => setBreakdown(item)}
                type="button"
              >
                {breakdownLabels[item]}
              </button>
            ))}
          </div>
          <div className="focused-breakdown">
            {horizontalBars({
              rows: breakdownRows,
              valueFormatter: formatUsd,
              selectedId: activeSlice?.kind === breakdown ? `${breakdown}:${activeSlice.label}` : "",
              onSelectRow: (row) => {
                setActiveSlice({ kind: breakdown, label: row.label });
              },
            })}
            {isFreePreview ? <LockedUpgradeRow label="Unlock all slices" onUpgrade={openAnalyticsUpgrade} /> : null}
          </div>
        </article>
        <article className="analytics-card">
          <h2>Top companies</h2>
          {horizontalBars({ rows: topCompanies, valueFormatter: formatUsd, onSelect: onSelectNode })}
          {isFreePreview ? <LockedUpgradeRow label="Show full company ranking" onUpgrade={openAnalyticsUpgrade} /> : null}
        </article>
        <article className="analytics-card">
          <h2>Top investors</h2>
          {horizontalBars({ rows: topInvestors, valueFormatter: formatUsd, onSelect: onSelectNode })}
          {isFreePreview ? <LockedUpgradeRow label="Show full investor ranking" onUpgrade={openAnalyticsUpgrade} /> : null}
        </article>
        <article className="analytics-card wide">
          <div className="slice-summary">
            <div>
              <span>Selected slice</span>
              <strong>{activeTitle}</strong>
            </div>
            <div>
              <span>Funding</span>
              <strong>{formatUsd(activeFunding)}</strong>
            </div>
            <div>
              <span>Events</span>
              <strong>{formatCount(activeRounds.length)}</strong>
            </div>
            <div>
              <span>Companies</span>
              <strong>{formatCount(activeCompanies)}</strong>
            </div>
            <div>
              <span>Investors</span>
              <strong>{formatCount(activeInvestors)}</strong>
            </div>
          </div>
          <div className="evidence-table">
            <div className="evidence-table-caption">
              <span>Largest events in selected slice</span>
              <strong>Showing {formatCount(evidenceLimit)} of {formatCount(activeRounds.length)}</strong>
            </div>
            <div className="evidence-table-head">
              <span>Company</span>
              <span>Country</span>
              <span>Domain</span>
              <span>Amount</span>
            </div>
            {evidenceRows.map((round) => {
              const startup = roundToStartup.get(round.id);
              const investors = investorByRound.get(round.id) || [];
              return (
                <div className="evidence-table-row" key={round.id}>
                  <button className="evidence-row-main" onClick={() => onSelectRound(round)} type="button">
                    <span>{startup?.label || round.startup_name || round.label}</span>
                    <span>{startup?.country || "Unknown"}</span>
                    <span>{startup?.domain || "Unknown"}</span>
                    <strong>{formatUsd(Number(round.amount_usd || 0))}</strong>
                    <small>{round.year} · {round.confidence} · {investors.slice(0, 3).map((node) => node.label).join(", ")}</small>
                  </button>
                  <div className="evidence-source-action">
                    {round.source_url ? (
                      <a
                        aria-label="Open funding source"
                        href={round.source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M7 17 17 7M9 7h8v8" />
                          <path d="M19 13v6H5V5h6" />
                        </svg>
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {hasLockedAnalyticsRows ? (
              <LockedUpgradeRow
                label={`Unlock ${formatCount(activeRounds.length - evidenceRows.length)} more events`}
                onUpgrade={openAnalyticsUpgrade}
              />
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

const eventTypeLabels: Record<string, string> = {
  funding_round: "Funding",
  valuation_update: "Valuation",
  ipo_watch: "IPO watch",
  ipo_filing: "IPO filing",
  ipo_pricing: "IPO pricing",
  public_listing: "Public listing",
  strategic_investment: "Strategic",
  compute_commitment: "Compute",
  acquisition_or_merger: "M&A",
  major_partnership: "Partnership",
  revenue_or_usage_milestone: "Milestone",
};

function eventLabel(value: string) {
  return eventTypeLabels[value] || value.replace(/_/g, " ");
}

function signalTierLabel(value: string) {
  const labels: Record<string, string> = {
    core_signal: "Core",
    watchlist_signal: "Watchlist",
    review_queue: "Review",
  };
  return labels[value] || value.replace(/_/g, " ");
}

function NewsSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <SinglePopoverSelect
      formatValue={(item) => (label === "Event" ? eventLabel(item) : label === "Signal" ? signalTierLabel(item) : item)}
      label={label}
      onChange={onChange}
      value={value}
      values={values}
    />
  );
}

function NewsPage({
  eventFeed,
  graph,
  onSelectCompany,
  isFreePreview,
  onUpgrade,
}: {
  eventFeed: MarketEventFeed | null;
  graph: MarketGraph;
  onSelectCompany: (node: MarketNode) => void;
  isFreePreview: boolean;
  onUpgrade: (prompt: UpgradePrompt) => void;
}) {
  const [eventType, setEventType] = useState("__all__");
  const [region, setRegion] = useState("__all__");
  const [status, setStatus] = useState("__all__");
  const [signalTier, setSignalTier] = useState("__all__");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"feed" | "ipo">("feed");

  const companyByName = useMemo(() => {
    const mapping = new Map<string, MarketNode>();
    graph.nodes.forEach((node) => {
      if (node.kind === "startup") mapping.set(node.label.toLowerCase(), node);
    });
    return mapping;
  }, [graph.nodes]);

  const events = useMemo(() => {
    return (eventFeed?.events || []).filter((event) => {
      if (eventType !== "__all__" && event.event_type !== eventType) return false;
      if (region !== "__all__" && event.region !== region) return false;
      if (status !== "__all__" && event.status !== status) return false;
      if (signalTier !== "__all__" && event.signal_tier !== signalTier) return false;
      const text = [
        event.company_name,
        eventLabel(event.event_type),
        event.event_type,
        signalTierLabel(event.signal_tier),
        event.signal_label,
        event.summary,
        event.notes,
        event.country,
        event.region,
        event.source_type,
        event.confidence,
        event.status,
      ].join(" ").toLowerCase();
      return text.includes(query.toLowerCase().trim());
    });
  }, [eventFeed, eventType, query, region, signalTier, status]);

  const ipoEvents = events.filter((event) => event.event_type.includes("ipo") || event.event_type === "public_listing");
  const coreEvents = events.filter((event) => event.signal_tier === "core_signal");
  const watchlistEvents = events.filter((event) => event.signal_tier === "watchlist_signal");
  const reviewEvents = events.filter((event) => event.signal_tier === "review_queue");
  const visibleFunding = events.reduce((sum, event) => sum + Number(event.amount_usd || 0), 0);
  const visibleEvents = isFreePreview ? events.slice(0, FREE_PREVIEW_LIMITS.newsFeedRows) : events;
  const visibleIpoEvents = isFreePreview ? ipoEvents.slice(0, FREE_PREVIEW_LIMITS.newsIpoRows) : ipoEvents;
  const openNewsUpgrade = () => onUpgrade({
    feature: "Full market feed",
    title: "Follow every signal, not just the highlights",
    body: "Starter unlocks the full event feed, IPO board, and deeper monitoring signals for regular market tracking.",
  });

  if (!eventFeed) {
    return <main className="news-page"><div className="loading">Loading market events...</div></main>;
  }

  return (
    <main className="news-page">
      <header className="analytics-header news-header">
        <div>
          <div className="eyebrow">Market monitor</div>
          <h1>AI ecosystem news</h1>
          <p>{eventFeed.metadata.scope_note}</p>
        </div>
        <div className="analytics-filters news-filters">
          <NewsSelect label="Signal" onChange={setSignalTier} value={signalTier} values={eventFeed.facets.signal_tiers} />
          <NewsSelect label="Event" onChange={setEventType} value={eventType} values={eventFeed.facets.event_types} />
          <NewsSelect label="Region" onChange={setRegion} value={region} values={eventFeed.facets.regions} />
          <NewsSelect label="Status" onChange={setStatus} value={status} values={eventFeed.facets.statuses} />
        </div>
      </header>

      <section className="analytics-kpis">
        <div>
          <span>Core signals</span>
          <strong>{formatCount(coreEvents.length)}</strong>
        </div>
        <div>
          <span>Watchlist</span>
          <strong>{formatCount(watchlistEvents.length)}</strong>
        </div>
        <div>
          <span>Review queue</span>
          <strong>{formatCount(reviewEvents.length)}</strong>
        </div>
        <div>
          <span>Linked capital</span>
          <strong>{formatUsd(visibleFunding)}</strong>
        </div>
      </section>

      <div className="news-mode-row">
        <div className="segmented-control news-mode" aria-label="News mode">
          <button className={mode === "feed" ? "active" : ""} onClick={() => setMode("feed")} type="button">
            Event feed
          </button>
          <button className={mode === "ipo" ? "active" : ""} onClick={() => setMode("ipo")} type="button">
            IPO / DPO board
          </button>
        </div>
        <label className="news-search">
          <span>Search news</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Company, IPO, country, source..."
            value={query}
          />
        </label>
      </div>

      {mode === "feed" ? (
      <section className="news-layout single">
        <article className="analytics-card news-feed-card">
          <h2>Event feed</h2>
          <div className="news-feed">
            {visibleEvents.map((event) => {
              const company = companyByName.get(event.company_name.toLowerCase());
              return (
                <div className="news-item" key={event.event_id}>
                  <div className="news-item-main">
                    <div className="news-item-topline">
                      <span>{event.event_date}</span>
                      <b className={`signal-${event.signal_tier}`}>{signalTierLabel(event.signal_tier)}</b>
                      <b>{eventLabel(event.event_type)}</b>
                      <em
                        className={
                          event.status === "approved"
                            ? "status-approved"
                            : event.status === "auto_ingested"
                              ? "status-auto"
                              : "status-review"
                        }
                      >
                        {event.status.replace("_", " ")}
                      </em>
                    </div>
                    <h3>{event.company_name}</h3>
                    <p>{event.summary}</p>
                    <div className="news-metrics">
                      {event.amount_usd ? <span>{formatUsd(Number(event.amount_usd))}</span> : null}
                      {event.valuation_usd ? <span>{formatUsd(Number(event.valuation_usd))} valuation</span> : null}
                      <span>{event.country}</span>
                      <span>{event.confidence}</span>
                    </div>
                  </div>
                  <div className="news-actions">
                    {company ? (
                      <button onClick={() => onSelectCompany(company)} type="button">Graph</button>
                    ) : null}
                    <a href={event.source_url} rel="noreferrer" target="_blank">Source</a>
                  </div>
                </div>
              );
            })}
            {isFreePreview && events.length > visibleEvents.length ? (
              <LockedUpgradeRow
                label={`Unlock ${formatCount(events.length - visibleEvents.length)} more signals`}
                onUpgrade={openNewsUpgrade}
              />
            ) : null}
          </div>
        </article>
      </section>
      ) : (
      <section className="news-layout single">
        <article className="analytics-card ipo-board-card">
          <h2>IPO / DPO watch board</h2>
          <div className="ipo-board">
            <div className="ipo-board-head">
              <span>Company</span>
              <span>Status</span>
              <span>Region</span>
              <span>Valuation</span>
            </div>
            {visibleIpoEvents.map((event) => (
              <div className="ipo-board-row" key={event.event_id}>
                <span>{event.company_name}</span>
                <strong>{eventLabel(event.event_type)}</strong>
                <span>{event.region}</span>
                <span>{event.valuation_usd ? formatUsd(Number(event.valuation_usd)) : "n/a"}</span>
                <small>{event.summary}</small>
              </div>
            ))}
            {isFreePreview && ipoEvents.length > visibleIpoEvents.length ? (
              <LockedUpgradeRow
                label={`Unlock ${formatCount(ipoEvents.length - visibleIpoEvents.length)} more IPO signals`}
                onUpgrade={openNewsUpgrade}
              />
            ) : null}
          </div>
        </article>
      </section>
      )}
    </main>
  );
}

function AuthControls({
  session,
  setSession,
  onOpenLogin,
  onOpenAccount,
}: {
  session: SupabaseSession | null;
  setSession: (session: SupabaseSession | null) => void;
  onOpenLogin: () => void;
  onOpenAccount: () => void;
}) {
  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }

  if (session) {
    return (
      <div className="auth-controls signed-in">
        <button className="profile-button" onClick={onOpenAccount} title="Profile" type="button" aria-label="Open profile">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button onClick={signOut} type="button">Sign out</button>
      </div>
    );
  }

  return (
    <div className="auth-controls">
      <button className="auth-primary" onClick={onOpenLogin} type="button">Sign in</button>
    </div>
  );
}

function AccountPage({
  session,
  onLoginRequired,
  onBack,
}: {
  session: SupabaseSession | null;
  onLoginRequired: () => void;
  onBack: () => void;
}) {
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingBusy, setBillingBusy] = useState<string | null>(null);
  const authToken = session?.access_token || "";

  useEffect(() => {
    if (!authToken) {
      setUsage(null);
      return;
    }
    fetch("/api/ask/usage", { headers: { "x-ask-token": authToken } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.usage) setUsage(payload.usage);
      })
      .catch(() => undefined);
  }, [authToken]);

  const openCheckout = async (planId: "starter" | "pro") => {
    if (!authToken) {
      onLoginRequired();
      return;
    }
    setBillingError("");
    setBillingBusy(planId);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ask-token": authToken,
        },
        body: JSON.stringify({ plan_id: planId, email: session?.user.email }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Checkout could not be started.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Checkout could not be started.");
      setBillingBusy(null);
    }
  };

  const openBillingPortal = async () => {
    if (!authToken) {
      onLoginRequired();
      return;
    }
    setBillingError("");
    setBillingBusy("portal");
    try {
      const response = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "x-ask-token": authToken },
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Billing portal could not be opened.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing portal could not be opened.");
      setBillingBusy(null);
    }
  };

  if (!session) {
    return (
      <main className="account-page" onMouseDown={onBack}>
        <section className="account-panel" onMouseDown={(event) => event.stopPropagation()}>
          <div>
            <span>Profile</span>
            <h1>Sign in to manage your plan.</h1>
            <p>Create an account to use the trial Ask allowance.</p>
          </div>
          <button className="account-primary" onClick={onLoginRequired} type="button">Sign in</button>
        </section>
      </main>
    );
  }

  const creditsRemaining = Number(usage?.credits_remaining || 0);
  const creditsPerPrompt = Number(usage?.credits_per_prompt || 1);
  const currentPlan = usage?.plan || "free";
  const subscriptionStatus = usage?.subscription_status || (currentPlan === "free" ? "trial" : "active");
  const hasPaidPlan = currentPlan === "starter" || currentPlan === "pro";

  return (
    <main className="account-page" onMouseDown={onBack}>
      <section className="account-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-header">
          <div>
            <span>Profile</span>
            <h1>Your account</h1>
            <p>{session.user.email}</p>
          </div>
          <div className="account-balance">
            <span>Ask allowance</span>
            <strong>{usage ? formatCount(creditsRemaining) : "..."}</strong>
            <small>{creditsPerPrompt} allowance unit per successful answer</small>
          </div>
        </div>

        <div className="profile-summary">
          <div>
            <span>Current plan</span>
            <strong>{subscriptionPlans.find((plan) => plan.id === currentPlan)?.label || "Free"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{subscriptionStatus.replace(/_/g, " ")}</strong>
          </div>
        </div>

        <div className="plan-grid">
          {subscriptionPlans.map((plan) => (
            <article
              className={[
                "plan-card",
                plan.id === currentPlan ? "current" : "",
                plan.id === "starter" && currentPlan !== "starter" ? "recommended" : "",
              ].join(" ")}
              key={plan.id}
            >
              <span>{plan.label}</span>
              <h2>{plan.price}</h2>
              <strong>{plan.askAllowance}</strong>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                disabled={billingBusy !== null || plan.id === currentPlan}
                onClick={() => {
                  if (plan.id === "starter" || plan.id === "pro") openCheckout(plan.id);
                }}
                type="button"
              >
                {plan.id === currentPlan ? "Current" : billingBusy === plan.id ? "Opening..." : plan.id === "free" ? "Included" : "Choose plan"}
              </button>
            </article>
          ))}
        </div>

        <div className="account-billing">
          <div>
            <span>Billing</span>
            <p>
              {hasPaidPlan
                ? "Manage payment method, invoices, cancellation, and plan changes through Stripe billing."
                : "Billing management becomes available after choosing a paid plan."}
            </p>
          </div>
          <button disabled={billingBusy !== null || !hasPaidPlan} onClick={openBillingPortal} type="button">
            {billingBusy === "portal" ? "Opening..." : hasPaidPlan ? "Manage billing" : "No active billing"}
          </button>
        </div>
        {billingError ? <p className="account-error">{billingError}</p> : null}
      </section>
    </main>
  );
}

function AdminEventsPage({ session, onLoginRequired }: { session: SupabaseSession | null; onLoginRequired: () => void }) {
  const [events, setEvents] = useState<AdminMarketEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState("needs_review");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const authToken = session?.access_token || "";

  const loadEvents = useCallback(() => {
    if (!authToken) return;
    setMessage("");
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    fetch(`/api/admin/events${query}`, { headers: { "x-ask-token": authToken } })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load review events.");
        setEvents(payload.events || []);
      })
      .catch((error) => {
        setEvents([]);
        setMessage(error instanceof Error ? error.message : "Could not load review events.");
      });
  }, [authToken, statusFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const reviewEvent = async (event: AdminMarketEvent, status: string) => {
    if (!authToken) {
      onLoginRequired();
      return;
    }
    setBusyId(`${event.candidate_id}:${status}`);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(event.candidate_id)}/review`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ask-token": authToken,
        },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Review update failed.");
      setEvents((current) => current.filter((item) => item.candidate_id !== event.candidate_id));
      setMessage(`${event.company_name} marked ${status.replace(/_/g, " ")}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review update failed.");
    } finally {
      setBusyId("");
    }
  };

  const markPromotionReady = async (event: AdminMarketEvent) => {
    if (!authToken) {
      onLoginRequired();
      return;
    }
    setBusyId(`${event.candidate_id}:promote`);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(event.candidate_id)}/promote`, {
        method: "POST",
        headers: { "x-ask-token": authToken },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Promotion marker failed.");
      setEvents((current) => current.filter((item) => item.candidate_id !== event.candidate_id));
      setMessage(payload.promotion_hint || `${event.company_name} is ready for CSV promotion.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Promotion marker failed.");
    } finally {
      setBusyId("");
    }
  };

  if (!session) {
    return (
      <main className="admin-page">
        <section className="admin-panel">
          <span>Admin</span>
          <h1>Sign in to review market events.</h1>
          <p>Only configured admin accounts can access candidate review.</p>
          <button className="account-primary" onClick={onLoginRequired} type="button">Sign in</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-panel">
        <div className="admin-header">
          <div>
            <span>Admin review</span>
            <h1>Market event candidates</h1>
            <p>Review auto-ingested events before they are promoted into the curated CSV graph dataset.</p>
          </div>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="needs_review">Needs review</option>
              <option value="auto_ingested">Auto ingested</option>
              <option value="approved">Approved</option>
              <option value="promotion_ready">Promotion ready</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </label>
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
        <div className="admin-event-list">
          {events.length ? events.map((event) => (
            <article className="admin-event-card" key={event.candidate_id}>
              <div>
                <span>{eventLabel(event.event_type)} · {event.confidence}</span>
                <h2>{event.company_name}</h2>
                <p>{event.summary || event.notes || "No summary available."}</p>
              </div>
              <div className="admin-event-meta">
                <span>{event.event_date || event.year || "No date"}</span>
                <span>{event.region || event.country || "No region"}</span>
                <span>{event.amount_usd ? formatUsd(Number(event.amount_usd)) : "No amount"}</span>
                <strong>{event.status.replace(/_/g, " ")}</strong>
              </div>
              <div className="admin-event-actions">
                <a href={event.source_url} rel="noreferrer" target="_blank">Source</a>
                <button disabled={Boolean(busyId)} onClick={() => reviewEvent(event, "approved")} type="button">Approve</button>
                <button disabled={Boolean(busyId)} onClick={() => markPromotionReady(event)} type="button">Ready for CSV</button>
                <button disabled={Boolean(busyId)} onClick={() => reviewEvent(event, "rejected")} type="button">Reject</button>
              </div>
            </article>
          )) : <p className="admin-empty">No candidates for this filter.</p>}
        </div>
      </section>
    </main>
  );
}

function LoginPage({
  onComplete,
  onRecoveryComplete,
  recovery,
}: {
  onComplete: () => void;
  onRecoveryComplete: () => void;
  recovery: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!supabase) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <div className="login-copy">
            <span>Ask access</span>
            <h1>Authentication is not configured.</h1>
            <p>Supabase environment variables are required before user accounts can be enabled.</p>
          </div>
        </section>
      </main>
    );
  }

  const trimmedEmail = email.trim();
  const canSubmit = recovery
    ? password.length >= 8 && status !== "loading"
    : trimmedEmail.length > 3 && password.length >= 8 && status !== "loading";

  async function submitPasswordAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !supabase) return;
    setStatus("loading");
    setMessage("");
    if (recovery) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("success");
      setMessage("Password updated.");
      onRecoveryComplete();
      onComplete();
      return;
    }

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: { emailRedirectTo: window.location.origin },
          });

    if (result.error) {
      setStatus("error");
      setMessage(result.error.message);
      return;
    }

    setStatus("success");
    if (mode === "signup" && !result.data.session) {
      setMessage("Check your email to confirm the account, then return to sign in.");
      return;
    }
    setMessage("Signed in.");
    onComplete();
  }

  async function signInWithGoogle() {
    if (!supabase || status === "loading") return;
    setStatus("loading");
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function resetPassword() {
    if (!trimmedEmail || !supabase || status === "loading") {
      setStatus("error");
      setMessage("Enter your email first.");
      return;
    }
    setStatus("loading");
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("success");
    setMessage("Password reset email sent.");
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-copy">
          <span>AI Market Graph</span>
          <h1>Sign in to use your Ask allowance.</h1>
          <p>
            Use the graph and market intelligence freely. Sign in when you want the assistant to reason over the
            visible network, funding rounds, investors, and sources.
          </p>
          <div className="login-proof">
            <strong>What your account unlocks</strong>
            <ul>
              <li>Metered Ask access tied to your user account.</li>
              <li>Credit top-ups through Stripe Checkout.</li>
              <li>Session-based access without sharing API keys.</li>
            </ul>
          </div>
        </div>
        <form className="login-form" onSubmit={submitPasswordAuth}>
          <div className="login-form-head">
            <span>{recovery ? "Password recovery" : mode === "signin" ? "Welcome back" : "Create account"}</span>
            <h2>{recovery ? "Set a new password" : mode === "signin" ? "Sign in" : "Start with an account"}</h2>
          </div>
          {!recovery ? <button className="google-button" onClick={signInWithGoogle} type="button">
            Continue with Google
          </button> : null}
          {!recovery ? <div className="login-divider"><span>or</span></div> : null}
          {!recovery ? <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label> : null}
          <label>
            {recovery ? "New password" : "Password"}
            <input
              autoComplete={mode === "signin" && !recovery ? "current-password" : "new-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              type="password"
              value={password}
            />
          </label>
          <button className="login-submit" disabled={!canSubmit} type="submit">
            {status === "loading" ? "Working..." : recovery ? "Update password" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {!recovery ? <div className="login-secondary-actions">
            <button
              onClick={() => {
                setMode((current) => (current === "signin" ? "signup" : "signin"));
                setStatus("idle");
                setMessage("");
              }}
              type="button"
            >
              {mode === "signin" ? "Create account" : "Use existing account"}
            </button>
            <button onClick={resetPassword} type="button">Reset password</button>
          </div> : null}
          {message ? <p className={`login-message ${status}`}>{message}</p> : null}
        </form>
      </section>
    </main>
  );
}

function toggle(list: string[], value: string): string[] {
  if (list.includes(value) && list.length === 1) return list;
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function App() {
  const [graph, setGraph] = useState<MarketGraph | null>(null);
  const [eventFeed, setEventFeed] = useState<MarketEventFeed | null>(null);
  const [view, setView] = useState<AppView>("graph");
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePrompt | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [postLoginAction, setPostLoginAction] = useState<"ask" | null>(null);
  const [graphViewportSignal, setGraphViewportSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<string>("");
  const [years, setYears] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string[]>([]);
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    years: [],
    regions: [],
    countries: [],
    domains: [],
    confidence: [],
  });
  const [drawerMode, setDrawerMode] = useState<"details" | "ask" | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(420);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("flow");
  const [expansion, setExpansion] = useState<Expansion>({
    rounds: true,
    investors: true,
    geography: true,
    peers: false,
  });

  useEffect(() => {
    fetch("/data/market_graph.json")
      .then((response) => response.json())
      .then((payload: MarketGraph) => {
        setGraph(payload);
        setYears(payload.facets.years);
        setCountries(payload.facets.countries);
        setConfidence(payload.facets.confidence);
        setAnalyticsFilters({
          years: payload.facets.years,
          regions: payload.facets.regions,
          countries: payload.facets.countries,
          domains: payload.facets.domains,
          confidence: payload.facets.confidence,
        });
        const initial =
          payload.nodes.find((node) => node.id === "startup_anthropic") ||
          payload.nodes
            .filter((node) => node.kind === "startup")
            .sort((left, right) => signal(right) - signal(left))[0];
        setSelectedId(initial?.id || "");
      });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setView("login");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && view === "login" && !passwordRecovery) {
      setView("graph");
      if (postLoginAction === "ask") {
        setDrawerMode("ask");
        setPostLoginAction(null);
      }
    }
  }, [passwordRecovery, postLoginAction, session, view]);

  useEffect(() => {
    const authToken = session?.access_token || "";
    if (!authToken) {
      setUsage(null);
      return;
    }
    fetch("/api/ask/usage", { headers: { "x-ask-token": authToken } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.usage) setUsage(payload.usage);
      })
      .catch(() => undefined);
  }, [session?.access_token]);

  useEffect(() => {
    fetch("/data/market_events.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: MarketEventFeed | null) => {
        if (payload) setEventFeed(payload);
      })
      .catch(() => setEventFeed(null));
  }, []);

  const index = useMemo(() => (graph ? buildIndex(graph) : undefined), [graph]);
  const selected = graph && selectedId ? graph.nodes.find((node) => node.id === selectedId) : undefined;
  const currentPlan = usage?.plan || "free";
  const isFreePreview = currentPlan === "free";
  const neighborhood = useMemo(() => {
    if (!graph || !index || !selected) return { nodes: [], edges: [] };
    return buildNeighborhood(selected, graph, index, expansion, years, countries, confidence, isFreePreview);
  }, [confidence, countries, expansion, graph, index, isFreePreview, selected, years]);

  const handleSelect = useCallback((node: MarketNode | undefined) => {
    if (!node) return;
    setSelectedId(node.id);
    setDrawerMode("details");
    setGraphViewportSignal((signal) => signal + 1);
  }, []);

  const openLogin = useCallback((afterLogin: "ask" | null = null) => {
    setPostLoginAction(afterLogin);
    setDrawerMode(null);
    setView("login");
  }, []);

  const openAskPanel = useCallback(() => {
    if (supabase && !session) {
      openLogin("ask");
      return;
    }
    setDrawerMode((current) => (current === "ask" ? null : "ask"));
  }, [openLogin, session]);

  const openGraphUpgrade = () => setUpgradePrompt({
    feature: "Full graph",
    title: "Unlock the full network",
    body: "Starter removes preview caps so you can expand peers, investors, rounds, and regional relationships without the shallow preview limit.",
  });

  const startDrawerResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = drawerWidth;
    const maxWidth = Math.min(760, window.innerWidth - 360);
    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(maxWidth, Math.max(340, startWidth + startX - moveEvent.clientX));
      setDrawerWidth(nextWidth);
      setGraphViewportSignal((signal) => signal + 1);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [drawerWidth]);

  if (!graph || !index || !selected) {
    return <div className="loading">Loading graph workspace...</div>;
  }

  const selectNodeAndOpenGraph = (node: MarketNode) => {
    setSelectedId(node.id);
    setDrawerMode("details");
    setExpansion({ rounds: true, investors: true, geography: true, peers: false });
    setView("graph");
    setGraphViewportSignal((signal) => signal + 1);
  };

  const selectSliceAndOpenGraph = (kind: AnalyticsBreakdown, label: string) => {
    if (kind === "confidence") return;
    const nodeKind = kind === "year" ? "year" : kind === "country" ? "country" : kind === "domain" ? "domain" : "region";
    const target = graph.nodes.find((node) => node.kind === nodeKind && node.label === label);
    if (!target) return;
    setYears(kind === "year" ? [label] : analyticsFilters.years);
    setCountries(kind === "country" ? [label] : analyticsFilters.countries);
    setConfidence(analyticsFilters.confidence);
    setLayoutMode("flow");
    selectNodeAndOpenGraph(target);
  };

  return (
    <div
      data-theme={themeMode}
      style={drawerMode ? ({ "--drawer-width": `${drawerWidth}px` } as React.CSSProperties) : undefined}
      className={[
    "app-shell",
    "explorer-shell",
    view === "analytics" ? "analytics-shell" : "",
        view === "news" ? "news-shell" : "",
        view === "login" ? "login-shell" : "",
        view === "account" ? "account-shell" : "",
        view === "admin" ? "admin-shell" : "",
        drawerMode ? "has-right" : "no-right",
      ].join(" ")}
    >
      <nav className="app-nav" aria-label="Application views">
        <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")} type="button">
          Graph
        </button>
        <button className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")} type="button">
          Analytics
        </button>
        <button className={view === "news" ? "active" : ""} onClick={() => setView("news")} type="button">
          News
        </button>
        {session ? (
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")} type="button">
            Admin
          </button>
        ) : null}
        <button
          className="theme-toggle"
          onClick={() => {
            setThemeMode((mode) => (mode === "dark" ? "light" : "dark"));
            setGraphViewportSignal((signal) => signal + 1);
          }}
          type="button"
        >
          {themeMode === "dark" ? "Light" : "Dark"}
        </button>
        <AuthControls
          session={session}
          setSession={setSession}
          onOpenAccount={() => setView("account")}
          onOpenLogin={() => openLogin()}
        />
      </nav>
      {view === "login" ? (
        <LoginPage
          onComplete={() => {
            setView("graph");
            if (postLoginAction === "ask") {
              setDrawerMode("ask");
              setPostLoginAction(null);
            }
          }}
          onRecoveryComplete={() => setPasswordRecovery(false)}
          recovery={passwordRecovery}
        />
      ) : view === "account" ? (
        <AccountPage session={session} onBack={() => setView("graph")} onLoginRequired={() => openLogin()} />
      ) : view === "admin" ? (
        <AdminEventsPage session={session} onLoginRequired={() => openLogin()} />
      ) : view === "news" ? (
        <NewsPage
          eventFeed={eventFeed}
          graph={graph}
          isFreePreview={isFreePreview}
          onSelectCompany={selectNodeAndOpenGraph}
          onUpgrade={setUpgradePrompt}
        />
      ) : view === "analytics" ? (
        <AnalyticsPage
          filters={analyticsFilters}
          graph={graph}
          isFreePreview={isFreePreview}
          onSelectNode={selectNodeAndOpenGraph}
          onSelectRound={selectNodeAndOpenGraph}
          onSelectSlice={selectSliceAndOpenGraph}
          onUpgrade={setUpgradePrompt}
          setFilters={setAnalyticsFilters}
        />
      ) : (
      <>
      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{kindLabels[selected.kind]}</div>
            <h2>{selected.label}</h2>
          </div>
          <QuickSearch
            graph={graph}
            onSelect={(node) => handleSelect(node)}
          />
        </header>
        <section className="graph-section">
          <HighLevelFilters
            confidence={confidence}
            countries={countries}
            graph={graph}
            setCountries={setCountries}
            setConfidence={setConfidence}
            setYears={setYears}
            years={years}
          />
          <DomainNavigator graph={graph} onSelect={(node) => handleSelect(node)} />
          <div className="graph-action-rail">
            <div className="rail-group" aria-label="Graph layout">
              <span>View</span>
              <button
                className={layoutMode === "flow" ? "active" : ""}
                onClick={() => setLayoutMode("flow")}
                aria-label="Guided map layout"
                title="Arrange companies, investors, and rounds in readable layers"
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <g transform="rotate(180 12 12)">
                  <circle cx="5" cy="6" r="1.8" />
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="5" cy="18" r="1.8" />
                  <path d="M7 6h5c2.8 0 4.6 1.3 5.8 3.7M7 12h9.5M7 18h5c2.8 0 4.6-1.3 5.8-3.7" />
                  <path d="M16 8l3.2 4-3.2 4" />
                  </g>
                </svg>
              </button>
              <button
                className={layoutMode === "network" ? "active" : ""}
                onClick={() => setLayoutMode("network")}
                aria-label="Network map layout"
                title="Show the graph as a force-directed relationship network"
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="6" cy="7" r="2.5" />
                  <circle cx="18" cy="8" r="2.5" />
                  <circle cx="10" cy="18" r="2.5" />
                  <path d="M8.3 8.1l7.4-.2M7.1 9.2l2 6.5M16.4 10.2l-4.8 6" />
                </svg>
              </button>
            </div>
            <div className="rail-group" aria-label="Side panel">
              <span>Panel</span>
              <button
                aria-label="Open selected entity details"
                className={drawerMode === "details" ? "active" : ""}
                onClick={() => setDrawerMode(drawerMode === "details" ? null : "details")}
                title="Show facts, connected entities, and evidence for the selected item"
                type="button"
              >
                Details
              </button>
              <button
                aria-label="Ask questions about the selected graph context"
                className={drawerMode === "ask" ? "active" : ""}
                onClick={openAskPanel}
                title="Ask the assistant about the selected entity and visible graph"
                type="button"
              >
                ASK AI
              </button>
            </div>
            {isFreePreview ? (
              <div className="rail-group" aria-label="Locked graph features">
                <span>Unlock</span>
                <button onClick={openGraphUpgrade} title="Unlock full graph exploration" type="button">
                  Full network
                </button>
              </div>
            ) : null}
          </div>
          <GraphView
            edges={neighborhood.edges}
            key={`${selected.id}:${view}:${drawerMode || "closed"}:${themeMode}:${graphViewportSignal}`}
            layoutMode={layoutMode}
            nodes={neighborhood.nodes}
            onSelect={handleSelect}
            selectedId={selected.id}
            themeMode={themeMode}
            viewportSignal={`${graphViewportSignal}:${drawerMode || "closed"}:${view}`}
          />
        </section>
      </main>

      {drawerMode ? (
      <aside className="inspector drawer">
        <button
          aria-label="Resize side panel"
          className="drawer-resize-handle"
          onPointerDown={startDrawerResize}
          type="button"
        />
        <div className="drawer-header">
          <span>{drawerMode === "ask" ? "Ask" : "Details"}</span>
          <button
            aria-label="Close panel"
            onClick={() => setDrawerMode(null)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {drawerMode === "ask" ? (
          <AskPanel
            edges={neighborhood.edges}
            nodes={neighborhood.nodes}
            onLoginRequired={() => openLogin("ask")}
            onOpenAccount={() => setView("account")}
            selected={selected}
            session={session}
          />
        ) : null}
        {drawerMode === "details" ? (
        <>
        <EntityProfile node={selected} />
        <DetailContext edges={neighborhood.edges} nodes={neighborhood.nodes} />
        <EvidenceTable nodes={neighborhood.nodes} />
        </>
        ) : null}
      </aside>
      ) : null}
      </>
      )}
      {upgradePrompt ? (
        <UpgradePromptModal
          prompt={upgradePrompt}
          onClose={() => setUpgradePrompt(null)}
          onViewPlans={() => {
            setUpgradePrompt(null);
            setView("account");
          }}
        />
      ) : null}
    </div>
  );
}

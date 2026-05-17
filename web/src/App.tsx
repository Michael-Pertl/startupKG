import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition, NodeSingular } from "cytoscape";
import { MarketEdge, MarketGraph, MarketNode, NodeKind } from "./types";
import { formatCount, formatUsd } from "./format";
import "./styles.css";

const buildLabel = "KG-22";

const kindLabels: Record<NodeKind, string> = {
  startup: "Company",
  investor: "Investor",
  round: "Funding event",
  country: "Country",
  region: "Region",
  domain: "AI domain",
  year: "Year",
};

const nodeColors: Record<NodeKind, string> = {
  startup: "#3dd6bf",
  investor: "#8da2fb",
  round: "#f2a65a",
  country: "#d6c7a1",
  region: "#9ca3af",
  domain: "#c7a86d",
  year: "#7dd3fc",
};

const confidenceHelp: Record<string, string> = {
  high: "Press release, Reuters, official filing, or equivalent primary source.",
  medium: "Reputable secondary startup or technology publication.",
  low: "Weak, unclear, or seed-only source. Use cautiously.",
};

type Expansion = {
  rounds: boolean;
  investors: boolean;
  geography: boolean;
  peers: boolean;
};

type LayoutMode = "flow" | "network";
type AppView = "graph" | "analytics";

type GraphIndex = {
  nodeById: Map<string, MarketNode>;
  edgesByNode: Map<string, MarketEdge[]>;
  raisedByRound: Map<string, MarketEdge>;
  startupRounds: Map<string, MarketEdge[]>;
};

function signal(node: MarketNode): number {
  return Number(
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

function buildNeighborhood(
  selected: MarketNode,
  graph: MarketGraph,
  index: GraphIndex,
  expansion: Expansion,
  years: string[],
  confidence: string[],
): { nodes: MarketNode[]; edges: MarketEdge[] } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const nodes: MarketNode[] = [];
  const edges: MarketEdge[] = [];

  addNode(nodeIds, nodes, selected);

  const incident = index.edgesByNode.get(selected.id) || [];
  const addIncidentEdge = (edge: MarketEdge) => {
    const target = index.nodeById.get(otherEnd(edge, selected.id));
    if (!target || !passesRoundFilters(target, years, confidence)) return;
    addNode(nodeIds, nodes, target);
    addEdge(edgeIds, edges, edge);
  };

  if (selected.kind === "startup") {
    const startupEdges = incident.filter((edge) => edge.kind === "headquartered_in" || edge.kind === "operates_in");
    if (expansion.geography) startupEdges.forEach(addIncidentEdge);

    const roundEdges = (index.startupRounds.get(selected.id) || [])
      .sort((left, right) => roundValue(right, index) - roundValue(left, index))
      .slice(0, expansion.rounds ? 12 : 0);

    for (const edge of roundEdges) {
      const round = index.nodeById.get(edge.target);
      if (!round || !passesRoundFilters(round, years, confidence)) continue;
      addNode(nodeIds, nodes, round);
      addEdge(edgeIds, edges, edge);

      if (expansion.investors) {
        for (const roundEdge of index.edgesByNode.get(round.id) || []) {
          if (roundEdge.kind !== "participated") continue;
          addNode(nodeIds, nodes, index.nodeById.get(roundEdge.source));
          addEdge(edgeIds, edges, roundEdge);
        }
      }
    }

    if (expansion.peers) {
      const peers = graph.nodes
        .filter(
          (node) =>
            node.kind === "startup" &&
            node.id !== selected.id &&
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
      .slice(0, 18);

    for (const edge of participationEdges) {
      const round = index.nodeById.get(edge.target);
      if (!round || !passesRoundFilters(round, years, confidence)) continue;
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
      .sort((left, right) => signal(right.startup) - signal(left.startup))
      .slice(0, 42);

    for (const { edge, startup } of startupEdges) {
      addNode(nodeIds, nodes, startup);
      addEdge(edgeIds, edges, edge);
      if (expansion.rounds) {
        const topRound = (index.startupRounds.get(startup.id) || [])
          .sort((left, right) => roundValue(right, index) - roundValue(left, index))
          .find((roundEdge) => {
            const round = index.nodeById.get(roundEdge.target);
            return round ? passesRoundFilters(round, years, confidence) : false;
          });
        if (topRound) {
          addNode(nodeIds, nodes, index.nodeById.get(topRound.target));
          addEdge(edgeIds, edges, topRound);
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

function radialOverviewPositions(nodes: MarketNode[], selectedId: string): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const ranked = [...nodes].sort((left, right) => signal(right) - signal(left));
  const ringByKind: Record<NodeKind, number> = {
    round: 220,
    startup: 315,
    investor: 445,
    country: 185,
    domain: 185,
    region: 535,
    year: 535,
  };
  const offsetByKind: Record<NodeKind, number> = {
    startup: 0.15,
    round: 0.58,
    investor: 1.05,
    country: 1.65,
    domain: 2.15,
    region: 2.8,
    year: 3.25,
  };

  ranked.forEach((node, index) => {
    if (node.id === selectedId) {
      positions.set(node.id, { x: 0, y: 0 });
      return;
    }
    const sameKindIndex = ranked.filter((item) => item.kind === node.kind).findIndex((item) => item.id === node.id);
    const sameKindTotal = ranked.filter((item) => item.kind === node.kind).length;
    const angle = offsetByKind[node.kind] + (sameKindIndex / Math.max(sameKindTotal, 1)) * Math.PI * 2;
    const radius = ringByKind[node.kind] + (index % 4) * 28;
    positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
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
  return layoutMode === "network" ? radialOverviewPositions(nodes, selectedId) : flowPositions(nodes, edges, selectedId);
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
      },
    })),
  ];
}

function GraphView({
  selectedId,
  nodes,
  edges,
  layoutMode,
  onSelect,
}: {
  selectedId: string;
  nodes: MarketNode[];
  edges: MarketEdge[];
  layoutMode: LayoutMode;
  onSelect: (node: MarketNode | undefined) => void;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<{ node: MarketNode; x: number; y: number } | null>(null);
  const cyRef = useRef<Core | null>(null);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeByIdRef = useRef(nodeById);

  useEffect(() => {
    nodeByIdRef.current = nodeById;
  }, [nodeById]);

  useEffect(() => {
    if (!container) return;
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
            "background-color": (element: NodeSingular) => nodeColors[element.data("kind") as NodeKind],
            color: "#d6d3c8",
            "font-size": 9,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 7,
            width: (element: NodeSingular) =>
              Math.min(58, Math.max(10, Math.sqrt(Number(element.data("weight")) / 90_000_000))),
            height: (element: NodeSingular) =>
              Math.min(58, Math.max(10, Math.sqrt(Number(element.data("weight")) / 90_000_000))),
            "border-width": 1.2,
            "border-color": "#101312",
            "text-outline-color": "#101312",
            "text-outline-width": 2,
          },
        },
        {
          selector: 'node[selected = "yes"]',
          style: {
            width: 76,
            height: 76,
            "border-width": 4,
            "border-color": "#f4d58d",
            label: "data(label)",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#3d4745",
            "curve-style": "bezier",
            "control-point-step-size": 28,
            "target-arrow-color": "#3d4745",
            "target-arrow-shape": "none",
            opacity: 0.3,
          },
        },
        {
          selector: 'edge[kind = "participated"]',
          style: {
            "line-color": "#6f7cc7",
            "target-arrow-color": "#6f7cc7",
            "target-arrow-shape": "triangle",
            opacity: 0.46,
          },
        },
        {
          selector: 'edge[kind = "raised"]',
          style: {
            "line-color": "#d79851",
            "target-arrow-color": "#d79851",
            "target-arrow-shape": "triangle",
            width: 2.2,
            opacity: 0.78,
          },
        },
        {
          selector: 'edge[kind = "operates_in"], edge[kind = "headquartered_in"]',
          style: {
            "line-color": "#9a9079",
            "line-style": "dashed",
            "target-arrow-color": "#9a9079",
            "target-arrow-shape": "triangle",
            width: 1.45,
            opacity: 0.56,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 4,
            "border-color": "#f4d58d",
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
  }, [container, onSelect]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(buildElements(nodes, edges, selectedId, layoutMode));
      cy.layout({ name: "preset", fit: false }).run();
    });
    window.requestAnimationFrame(() => cy.fit(undefined, 54));
  }, [edges, layoutMode, nodes, selectedId]);

  return (
    <div className="graph-frame">
      <div className="graph-hud">
        <span>{formatCount(nodes.length)} entities</span>
        <span>{formatCount(edges.length)} relationships</span>
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
  expansion,
  setExpansion,
  onSelect,
}: {
  graph: MarketGraph;
  expansion: Expansion;
  setExpansion: (expansion: Expansion) => void;
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
      <div className="inline-controls" aria-label="Graph filters">
        <div className="inline-group">
          {([
            ["rounds", "events"],
            ["investors", "investors"],
            ["geography", "geo"],
            ["peers", "peers"],
          ] as Array<[keyof Expansion, string]>).map(([key, label]) => (
            <button
              className={expansion[key] ? "inline-chip active" : "inline-chip"}
              key={key}
              onClick={() => setExpansion({ ...expansion, [key]: !expansion[key] })}
              type="button"
              title={`Toggle ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HighLevelFilters({
  graph,
  years,
  confidence,
  setYears,
  setConfidence,
}: {
  graph: MarketGraph;
  years: string[];
  confidence: string[];
  setYears: (years: string[]) => void;
  setConfidence: (confidence: string[]) => void;
}) {
  const confidenceValue =
    confidence.length === graph.facets.confidence.length ? "__all__" : confidence[0] || "__all__";
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

function AskPanel({
  selected,
  nodes,
  edges,
}: {
  selected: MarketNode;
  nodes: MarketNode[];
  edges: MarketEdge[];
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || status === "loading") return;
    setStatus("loading");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setQuestion("");
    setError("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          selected,
          neighborhood: {
            nodes: nodes.slice(0, 80),
            edges: edges.slice(0, 140),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The graph assistant is not available.");
      setMessages((current) => [...current, { role: "assistant", content: payload.answer }]);
      setStatus("idle");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "The graph assistant is not available.");
    }
  }

  return (
    <section className="ask-panel">
      <div className="chat-thread">
        {messages.length ? (
          messages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.content}
            </div>
          ))
        ) : (
          <div className="chat-empty">Ask about the selected entity or the currently visible graph.</div>
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
          placeholder={`Ask about ${selected.label} or the visible graph context...`}
          value={question}
        />
        <button className="send-button" disabled={status === "loading" || !question.trim()} onClick={ask} type="button">
          Send
        </button>
      </div>
      {status === "error" ? (
        <div className="assistant-error">
          {error}
          <br />
          Start the local model proxy with <code>npm run ask-server</code>. The key is loaded from <code>web/.env.local</code>.
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
  domains: string[];
  confidence: string[];
};

function AnalyticsSelect({
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
    <label className="analytics-select">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="__all__">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function setSingleOrAll(value: string, allValues: string[]): string[] {
  return value === "__all__" ? allValues : [value];
}

function selectedValue(values: string[], allValues: string[]): string {
  return values.length === allValues.length ? "__all__" : values[0] || "__all__";
}

function horizontalBars({
  rows,
  valueFormatter,
  onSelect,
}: {
  rows: Array<{ id: string; label: string; value: number; node?: MarketNode }>;
  valueFormatter?: (value: number) => string;
  onSelect?: (node: MarketNode) => void;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="bar-list">
      {rows.map((row) => (
        <button
          className={row.node && onSelect ? "bar-row clickable" : "bar-row"}
          disabled={!row.node || !onSelect}
          key={row.id}
          onClick={() => row.node && onSelect?.(row.node)}
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
}: {
  graph: MarketGraph;
  filters: AnalyticsFilters;
  setFilters: (filters: AnalyticsFilters) => void;
  onSelectNode: (node: MarketNode) => void;
}) {
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

  const filteredRounds = useMemo(() => {
    return graph.nodes
      .filter((node) => node.kind === "round")
      .filter((round) => {
        const startup = roundToStartup.get(round.id);
        if (round.year && !filters.years.includes(String(round.year))) return false;
        if (round.confidence && !filters.confidence.includes(round.confidence)) return false;
        if (startup?.region && !filters.regions.includes(startup.region)) return false;
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

  const aggregate = (key: "year" | "domain" | "region") => {
    const totals = new Map<string, number>();
    filteredRounds.forEach((round) => {
      const startup = roundToStartup.get(round.id);
      const label = key === "year" ? String(round.year || "Unknown") : String(startup?.[key] || "Unknown");
      totals.set(label, (totals.get(label) || 0) + Number(round.amount_usd || 0));
    });
    return [...totals.entries()]
      .map(([label, value]) => ({ id: label, label, value }))
      .sort((left, right) => right.value - left.value);
  };

  const topCompanies = [...filteredStartups]
    .sort((left, right) => Number(right.visible_mega_round_funding_usd || 0) - Number(left.visible_mega_round_funding_usd || 0))
    .slice(0, 10)
    .map((node) => ({
      id: node.id,
      label: node.label,
      value: Number(node.visible_mega_round_funding_usd || 0),
      node,
    }));

  const topInvestors = [...visibleInvestors]
    .sort((left, right) => Number(right.linked_funding_usd || 0) - Number(left.linked_funding_usd || 0))
    .slice(0, 10)
    .map((node) => ({
      id: node.id,
      label: node.label,
      value: Number(node.linked_funding_usd || 0),
      node,
    }));

  const yearRows = aggregate("year").sort((left, right) => left.label.localeCompare(right.label));
  const domainRows = aggregate("domain").slice(0, 10);
  const regionRows = aggregate("region");

  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <div className="eyebrow">Market analytics</div>
          <h1>AI funding momentum</h1>
        </div>
        <div className="analytics-filters">
          <AnalyticsSelect
            label="Year"
            onChange={(value) => setFilters({ ...filters, years: setSingleOrAll(value, graph.facets.years) })}
            value={selectedValue(filters.years, graph.facets.years)}
            values={graph.facets.years}
          />
          <AnalyticsSelect
            label="Region"
            onChange={(value) => setFilters({ ...filters, regions: setSingleOrAll(value, graph.facets.regions) })}
            value={selectedValue(filters.regions, graph.facets.regions)}
            values={graph.facets.regions}
          />
          <AnalyticsSelect
            label="Domain"
            onChange={(value) => setFilters({ ...filters, domains: setSingleOrAll(value, graph.facets.domains) })}
            value={selectedValue(filters.domains, graph.facets.domains)}
            values={graph.facets.domains}
          />
          <AnalyticsSelect
            label="Confidence"
            onChange={(value) => setFilters({ ...filters, confidence: setSingleOrAll(value, graph.facets.confidence) })}
            value={selectedValue(filters.confidence, graph.facets.confidence)}
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
          <h2>Funding by year</h2>
          {horizontalBars({ rows: yearRows, valueFormatter: formatUsd })}
        </article>
        <article className="analytics-card">
          <h2>Funding by domain</h2>
          {horizontalBars({ rows: domainRows, valueFormatter: formatUsd })}
        </article>
        <article className="analytics-card">
          <h2>Funding by region</h2>
          {horizontalBars({ rows: regionRows, valueFormatter: formatUsd })}
        </article>
        <article className="analytics-card">
          <h2>Top companies</h2>
          {horizontalBars({ rows: topCompanies, valueFormatter: formatUsd, onSelect: onSelectNode })}
        </article>
        <article className="analytics-card">
          <h2>Top investors</h2>
          {horizontalBars({ rows: topInvestors, valueFormatter: formatUsd, onSelect: onSelectNode })}
        </article>
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
  const [view, setView] = useState<AppView>("graph");
  const [selectedId, setSelectedId] = useState<string>("");
  const [years, setYears] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string[]>([]);
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    years: [],
    regions: [],
    domains: [],
    confidence: [],
  });
  const [drawerMode, setDrawerMode] = useState<"details" | "ask" | null>(null);
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
        setConfidence(payload.facets.confidence);
        setAnalyticsFilters({
          years: payload.facets.years,
          regions: payload.facets.regions,
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

  const index = useMemo(() => (graph ? buildIndex(graph) : undefined), [graph]);
  const selected = graph && selectedId ? graph.nodes.find((node) => node.id === selectedId) : undefined;
  const neighborhood = useMemo(() => {
    if (!graph || !index || !selected) return { nodes: [], edges: [] };
    return buildNeighborhood(selected, graph, index, expansion, years, confidence);
  }, [confidence, expansion, graph, index, selected, years]);

  const handleSelect = useCallback((node: MarketNode | undefined) => {
    if (node) setSelectedId(node.id);
  }, []);

  if (!graph || !index || !selected) {
    return <div className="loading">Loading graph workspace...</div>;
  }

  const selectNodeAndOpenGraph = (node: MarketNode) => {
    setSelectedId(node.id);
    setView("graph");
  };

  return (
    <div
      className={[
        "app-shell",
        "explorer-shell",
        view === "analytics" ? "analytics-shell" : "",
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
      </nav>
      {view === "analytics" ? (
        <AnalyticsPage
          filters={analyticsFilters}
          graph={graph}
          onSelectNode={selectNodeAndOpenGraph}
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
            expansion={expansion}
            graph={graph}
            onSelect={(node) => setSelectedId(node.id)}
            setExpansion={setExpansion}
          />
        </header>
        <section className="graph-section">
          <HighLevelFilters
            confidence={confidence}
            graph={graph}
            setConfidence={setConfidence}
            setYears={setYears}
            years={years}
          />
          <DomainNavigator graph={graph} onSelect={(node) => setSelectedId(node.id)} />
          <div className="graph-action-rail">
            <div className="layout-toggle" aria-label="Graph layout">
              <button
                className={layoutMode === "flow" ? "active" : ""}
                onClick={() => setLayoutMode("flow")}
                title="Flow layout"
                type="button"
              >
                Flow
              </button>
              <button
                className={layoutMode === "network" ? "active" : ""}
                onClick={() => setLayoutMode("network")}
                title="Network layout"
                type="button"
              >
                Net
              </button>
            </div>
            <button
              aria-label="Open details"
              className={drawerMode === "details" ? "rail-button active" : "rail-button"}
              onClick={() => setDrawerMode(drawerMode === "details" ? null : "details")}
              type="button"
            >
              Details
            </button>
            <button
              aria-label="Open ask"
              className={drawerMode === "ask" ? "rail-button active" : "rail-button"}
              onClick={() => setDrawerMode(drawerMode === "ask" ? null : "ask")}
              type="button"
            >
              Ask
            </button>
            <span>{buildLabel}</span>
          </div>
          <GraphView
            edges={neighborhood.edges}
            layoutMode={layoutMode}
            nodes={neighborhood.nodes}
            onSelect={handleSelect}
            selectedId={selected.id}
          />
        </section>
      </main>

      {drawerMode ? (
      <aside className="inspector drawer">
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
        {drawerMode === "ask" ? <AskPanel edges={neighborhood.edges} nodes={neighborhood.nodes} selected={selected} /> : null}
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
    </div>
  );
}

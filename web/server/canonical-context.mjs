import { retrieveConnections } from "./graph-retrieval.mjs";

// Browser payloads identify entities; published server data supplies the evidence.
export function canonicalContext(graph, payload) {
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
    throw new Error("Published graph evidence is unavailable.");
  }
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const selected = byId.get(payload.selected?.id) || {};
  const requested = Array.isArray(payload.neighborhood?.nodes) ? payload.neighborhood.nodes : [];
  const expanded = payload.scope === "visible" ? null : retrieveConnections(graph, payload, selected);
  const ids = new Set([...(expanded?.ids || []), selected.id, ...requested.map(node => node?.id)].filter(id => byId.has(id)));
  const nodes = [...ids].slice(0, expanded ? 240 : 80).map(id => byId.get(id));
  const visible = new Set(nodes.map(node => node.id));
  const requiredLinks = new Set();
  for (const path of expanded?.paths || []) {
    if (path.entity_round_id) {
      requiredLinks.add(`${path.entity_id}|${path.entity_round_id}`);
      requiredLinks.add(`${path.investor_id}|${path.entity_round_id}`);
    }
    requiredLinks.add(`${path.investor_id}|${path.portfolio_round_id}`);
    requiredLinks.add(`${path.company_id}|${path.portfolio_round_id}`);
  }
  const connected = graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target));
  const edges = [...connected.filter(edge => requiredLinks.has(`${edge.source}|${edge.target}`)),
    ...connected.filter(edge => !requiredLinks.has(`${edge.source}|${edge.target}`))].slice(0, expanded ? 420 : 140);
  return { selected, nodes, edges, paths: expanded?.paths || [],
    retrieval: expanded ? { ...expanded.retrieval, truncated: expanded.retrieval.truncated || ids.size > nodes.length } : { scope: "visible", matched_entities: [], truncated: false }, evidence: {
    scope_note: graph.metadata?.scope_note,
    generated_at: graph.metadata?.generated_at,
    latest_funding_date: graph.metadata?.latest_funding_date,
    snapshot_id: graph.metadata?.snapshot_id,
  } };
}

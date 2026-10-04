// Browser payloads identify entities; published server data supplies the evidence.
export function canonicalContext(graph, payload) {
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
    throw new Error("Published graph evidence is unavailable.");
  }
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const selected = byId.get(payload.selected?.id) || {};
  const requested = Array.isArray(payload.neighborhood?.nodes) ? payload.neighborhood.nodes : [];
  const ids = new Set([selected.id, ...requested.map(node => node?.id)].filter(id => byId.has(id)));
  const nodes = [...ids].slice(0, 80).map(id => byId.get(id));
  const visible = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)).slice(0, 140);
  return { selected, nodes, edges, evidence: {
    scope_note: graph.metadata?.scope_note,
    generated_at: graph.metadata?.generated_at,
    latest_funding_date: graph.metadata?.latest_funding_date,
    snapshot_id: graph.metadata?.snapshot_id,
  } };
}

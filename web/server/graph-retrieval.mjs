// Resolve named companies/investors and walk funding paths in published evidence.
// Generic country/domain hubs are deliberately not traversed as investment links.
export function retrieveConnections(graph, payload, selected) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const companiesByRound = new Map();
  const roundsByCompany = new Map();
  const backersByRound = new Map();
  const roundsByInvestor = new Map();
  const add = (map, key, value) => map.set(key, [...(map.get(key) || []), value]);
  for (const edge of graph.edges) {
    if (edge.kind === 'raised' && byId.get(edge.source)?.kind === 'startup' && byId.get(edge.target)?.kind === 'round') {
      companiesByRound.set(edge.target, edge.source);
      add(roundsByCompany, edge.source, edge.target);
    }
    if (edge.kind === 'participated' && byId.get(edge.source)?.kind === 'investor' && byId.get(edge.target)?.kind === 'round') {
      add(backersByRound, edge.target, edge.source);
      add(roundsByInvestor, edge.source, edge.target);
    }
  }
  const entities = graph.nodes.filter(node => ['startup', 'investor'].includes(node.kind));
  const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const mentions = text => {
    const query = ` ${normalize(text)} `;
    return entities.filter(node => {
      const name = normalize(node.label);
      return name.length >= 3 && query.includes(` ${name} `);
    }).sort((a, b) => b.label.length - a.label.length || a.id.localeCompare(b.id));
  };
  let matches = mentions(String(payload.question || '').slice(0, 8000));
  if (!matches.length) {
    const users = Array.isArray(payload.messages) ? payload.messages.filter(message => message.role === 'user' && typeof message.content === 'string').slice(-2).reverse() : [];
    for (const message of users) {
      matches = mentions(message.content.slice(0, 1600));
      if (matches.length) break;
    }
  }
  if (!matches.length && selected?.id) {
    const anchor = selected.kind === 'round' ? byId.get(companiesByRound.get(selected.id)) : selected;
    if (anchor && ['startup', 'investor'].includes(anchor.kind)) matches = [anchor];
  }
  const roots = matches.slice(0, 6);
  const paths = [];
  const pathKeys = new Set();
  const eligible = id => byId.get(id)?.confidence !== 'low';
  const addPath = (root, rootRound, investor, round, company) => {
    if (!company || !eligible(round) || (rootRound && !eligible(rootRound))) return;
    const ids = [root, rootRound, investor, round, company].filter(Boolean);
    const key = ids.join('|');
    if (pathKeys.has(key)) return;
    pathKeys.add(key);
    paths.push({ entity_id: root, entity_round_id: rootRound || null, investor_id: investor, portfolio_round_id: round, company_id: company });
  };
  for (const root of roots) {
    if (root.kind === 'investor') {
      for (const round of roundsByInvestor.get(root.id) || []) addPath(root.id, null, root.id, round, companiesByRound.get(round));
    } else {
      for (const rootRound of roundsByCompany.get(root.id) || []) {
        for (const investor of backersByRound.get(rootRound) || []) {
          for (const round of roundsByInvestor.get(investor) || []) addPath(root.id, rootRound, investor, round, companiesByRound.get(round));
        }
      }
    }
  }
  // Round-robin by investor keeps broad portfolios from hiding smaller backers.
  const grouped = new Map();
  for (const path of paths.sort((a, b) => a.portfolio_round_id.localeCompare(b.portfolio_round_id))) add(grouped, path.investor_id, path);
  const retained = [];
  const ids = new Set(roots.map(node => node.id));
  const groups = [...grouped.values()];
  for (let index = 0; retained.length < 80 && groups.some(group => group[index]); index++) {
    for (const group of groups) {
      const path = group[index];
      if (!path || retained.length >= 80) continue;
      const nextIds = Object.values(path).filter(Boolean);
      if (new Set([...ids, ...nextIds]).size > 220) continue;
      retained.push(path);
      for (const id of nextIds) ids.add(id);
    }
  }

  const investorCoverage = [...grouped.entries()].map(([id, all]) => ({
    investor_id: id, investor: byId.get(id)?.label,
    portfolio_companies_in_graph: new Set(all.map(path => path.company_id)).size,
    retrieved_paths: retained.filter(path => path.investor_id === id).length,
    available_paths: all.length,
  }));
  return { ids: [...ids], paths: retained, retrieval: {
    scope: 'graph', matched_entities: roots.map(node => ({ id: node.id, label: node.label, kind: node.kind })),
    available_paths: paths.length, retrieved_paths: retained.length,
    truncated: matches.length > roots.length || retained.length < paths.length,
    investor_coverage: investorCoverage,
    note: 'Search covers the published curated graph, independent of view filters. Paths show shared funding participation, not confirmed partnerships or a calibrated partnership probability. Low-confidence rounds are excluded. Portfolio coverage is incomplete.',
  } };
}

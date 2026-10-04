import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalContext } from '../server/canonical-context.mjs';

const graph = { metadata: { latest_funding_date: '2026-09-10' }, nodes: [
  { id: 'round', kind: 'round', amount_usd: 100, source_url: 'https://example.org/evidence' },
  { id: 'startup', kind: 'startup' },
], edges: [{ id: 'edge', source: 'startup', target: 'round', kind: 'raised' }] };

test('browser cannot replace published amounts, sources or relationships', () => {
  const context = canonicalContext(graph, {
    selected: { id: 'round', amount_usd: 999, source_url: 'https://attacker.invalid' },
    neighborhood: { nodes: [{ id: 'startup', label: 'invented' }, { id: 'fiction' }],
      edges: [{ source: 'round', target: 'startup', kind: 'invented' }] },
  });
  assert.equal(context.selected.amount_usd, 100);
  assert.equal(context.selected.source_url, 'https://example.org/evidence');
  assert.equal(context.nodes.length, 2);
  assert.deepEqual(context.edges, graph.edges);
  assert.equal(context.evidence.latest_funding_date, '2026-09-10');
});
test('unknown entities do not become evidence', () => {
  assert.deepEqual(canonicalContext(graph, { selected: { id: 'fake' } }).selected, {});
  assert.throws(() => canonicalContext(null, {}), /unavailable/);
});

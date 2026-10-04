import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/investorAnalytics.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { selectResearchRounds, periodMetrics } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
const rounds = [
  { id: 'a', year: '2025', round_date: '2025-03-01', amount_usd: 100, startup_id: 'one', round_type: 'Series B' },
  { id: 'b', year: '2025', round_date: '2025-10-01', amount_usd: 900, startup_id: 'two', round_type: 'Series C' },
  { id: 'c', year: '2026', round_date: '2026-04-01', amount_usd: 200, startup_id: 'one', round_type: 'Debt financing' },
  { id: 'd', year: '2026', round_date: '', amount_usd: 800, startup_id: 'two', round_type: 'Series B' },
];
test('commitments cannot enter the default equity comparison under a growth label', () => {
  const examples = ['committed_capital', 'includes_prior_commitments', 'mixed_primary_secondary', 'upper_bound'].map((amount_basis, index) => ({
    id: String(index), kind: 'round', round_type: 'Growth round', amount_basis,
  }));
  assert.deepEqual(selectResearchRounds(examples, { comparable: false, equityOnly: true, cutoff: '', excludeLargest: false }), []);
  assert.equal(selectResearchRounds(examples, { comparable: false, equityOnly: false, cutoff: '', excludeLargest: false }).length, 4);
});
test('comparable periods exclude later dates, missing dates and debt', () => {
  const selected = selectResearchRounds(rounds, { comparable: true, equityOnly: true, cutoff: '2026-09-08', excludeLargest: false });
  assert.deepEqual(selected.map(row => row.id), ['a']);
});
test('largest-round sensitivity removes one round per year', () => {
  const selected = selectResearchRounds(rounds, { comparable: false, equityOnly: false, cutoff: '', excludeLargest: true });
  assert.deepEqual(selected.map(row => row.id), ['a', 'c']);
});
test('median, concentration and empty years are defined', () => {
  const periods = periodMetrics(rounds, ['2025', '2024']);
  assert.equal(periods[0].funding, 0);
  assert.equal(periods[0].topFiveShare, 0);
  assert.equal(periods[1].median, 500);
  assert.equal(periods[1].topFiveShare, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/investorAnalytics.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { selectResearchRounds, periodMetrics, evidenceCsv } = await import(
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

test('company counts use graph relationships and do not count missing identifiers', () => {
  const events = [{ id: 'a', year: '2025', amount_usd: 100 }, { id: 'b', year: '2025', amount_usd: 200 }, { id: 'c', year: '2025', amount_usd: 300 }];
  const companies = new Map([['a', { id: 'one' }], ['b', { id: 'one' }], ['c', { id: 'two' }]]);
  assert.equal(periodMetrics(events, ['2025'], companies)[0].companies, 2);
  assert.equal(periodMetrics(events, ['2025'])[0].companies, 0);
});
test('evidence CSV includes sources and safely quotes spreadsheet values', () => {
  const csv = evidenceCsv([{ id: 'round', label: 'Fallback', amount_usd: 100, source_url: 'https://example.org/source', confidence: 'high' }],
    new Map([['round', { label: '=danger,"quoted"', country: 'US' }]]), new Map([['round', [{ label: 'Investor A' }]]]));
  assert.match(csv, /"'=danger,""quoted"""/);
  assert.match(csv, /https:\/\/example.org\/source/);
  assert.match(csv, /Investor A/);
  assert.equal(csv.split('\r\n').length, 3);
});

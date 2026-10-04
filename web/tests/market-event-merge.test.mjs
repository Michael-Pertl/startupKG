import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMarketEventRows } from '../server/market-event-merge.mjs';

const curated = { event_id: 'curated_one', company_name: 'Example', event_date: '2026-09-01', event_type: 'funding_round', status: 'approved' };
test('live candidates preserve curated timeline and rejection decisions', () => {
  const discovery = { ...curated, event_id: 'live_one', status: 'needs_review' };
  assert.equal(mergeMarketEventRows([curated], [discovery])[0].status, 'approved');
  assert.equal(mergeMarketEventRows([curated], [{ ...discovery, status: 'rejected' }])[0].status, 'rejected');
  const other = { ...discovery, event_date: '2026-09-02' };
  assert.equal(mergeMarketEventRows([curated], [other]).length, 2);
});

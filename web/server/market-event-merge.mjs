export function mergeMarketEventRows(curated, live) {
  const key = (row) => row.event_date
    ? `${String(row.company_name || '').trim().toLowerCase()}|${row.event_date}|${row.event_type}`
    : row.event_id || row.candidate_id;
  const merged = new Map(curated.map(row => [key(row), row]));
  for (const row of live) {
    const existing = merged.get(key(row));
    if (!existing || row.status === 'approved' || row.status === 'rejected' || existing.status !== 'approved') {
      merged.set(key(row), row);
    }
  }
  return [...merged.values()];
}

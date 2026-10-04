# Customer readiness: October 4, 2026

The graph represents curated publicly reported AI mega-rounds above USD100M,
not the full AI startup ecosystem. The current dataset has 212 events and 164
companies. A source URL and a high confidence label do not prove a recent source
recheck, market completeness, or cash actually disbursed.

## Implemented safeguards

- Raw evidence is unchanged. Validated sourced correction overlays revise amounts,
  dates and source links without inserting the same financing a second time.
- Explicit amount basis distinguishes reported rounds, committed capital, amounts
  including prior commitments, debt, mixed primary/secondary transactions and
  upper/lower bounds. Existing raw notes supply conservative classifications;
  this does not count as a new source recheck. Analytics defaults exclude debt,
  secondary, mixed/committed capital and upper-bound amounts. Lower bounds remain
  reported minima, not exact cash amounts.
- Source rechecks are recorded separately from confidence and pipeline run time.
  `core_fields_checked` covers reported amount, date and named investors, not an
  independent audit or an exhaustive investor list.
- Ask resolves graph entities and relationships from published server evidence;
  it cannot use browser-supplied replacements for amounts or sources.
- Refreshes use a Linux/WSL single-writer lock, bounded step timeouts and publish
  failure status. Tavily remains opt-in. CI validates data and runs regression
  tests and the frontend build without live discovery or deployment secrets.

## Sourced corrections

[OpenAI's final March 31 announcement](https://openai.com/index/accelerating-the-next-phase-ai/)
reports USD122B of committed capital. This replaces the February USD110B entry
for the same financing; both entries must not be summed. The original February
evidence remains in raw data. The effective row uses the final closing date and
source, and remains explicitly classified as committed capital. Recorded investor
participation is partial, not a capital allocation by investor.

[Anthropic's May 28 announcement](https://www.anthropic.com/news/series-h)
reports USD65B, including USD15B of previously committed hyperscaler investments.
The total is retained with a mixed-commitment basis, not relabeled as fresh cash.
These two core-field rechecks do not imply all 212 historical records were audited.

## Release commands

```bash
python3 scripts/refresh_platform.py --discover
python3 -m unittest discover -s tests -v
python3 scripts/check_customer_readiness.py --require-ready
python3 scripts/check_deployed_data.py --url https://aimarketgraph.com
cd web
npm test
npm run build
npm run check:deploy-env
```

The readiness check intentionally fails while evidence/operational gaps remain.
It evaluates current timestamps, not just the state when the JSON was generated.
Its 48-hour discovery and 72-hour rebuild checks are operational targets, not
guarantees of current worldwide coverage. Core-field rechecks and metadata must
be complete for this conservative paid-release gate. Payment/authentication,
privacy/terms, backups, production monitoring and deployed smoke tests remain
separate requirements in `LAUNCH_CHECKLIST.md`.

## Remaining release work

1. Establish structured public-source adapters with field-level provenance; RSS
   is still discovery only. No arbitrary public CSV should be trusted as verified.
2. Recheck high-impact historical rounds first, then the remaining evidence. Detect
   updates to existing rounds and keep original observations and amount bases.
3. Fill the 63 investors with incomplete metadata and expand underrepresented
   regions through documented sampling; do not claim representative global totals.
4. Schedule daily single-writer refreshes on persistent production storage and
   alert on failures. Boot-time refreshes and merged code do not create a schedule.
5. Run deployed authentication, billing, refund/support and data-freshness smoke
tests before accepting paying customers. CI is not a production launch approval.

## Observed production state

On October 4, the public GET `/api/health` endpoint reports Supabase auth with
Ask authentication required and model/payment services configured. This confirms
configuration presence, not working payments or successful authenticated requests.
The deployed graph still contains 201 rounds, and `/data/data_health.json` returns
not found. The merged 212-round update is therefore not in the served bundle.
Redeploy the merged branch and run the snapshot check before evaluating freshness
or accepting customer-facing data claims. No Render deployment was triggered here.

A clearly scoped preview is appropriate for feedback. An accurate, comprehensive
current global-landscape claim is not supported by the present coverage.

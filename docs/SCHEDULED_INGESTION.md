# Daily RSS ingestion

The graph represents curated publicly reported AI mega-rounds of USD100M or more in 2024–2026, not the full AI startup ecosystem.

## Render setup

1. Run `supabase/migrations/20261015_platform_snapshots.sql` in the Supabase SQL editor. The table is service-role only; never put that key in a `VITE_` variable.
2. Create a **separate Render Cron Job** using this repository. Use Python runtime, build command `python3 --version`, and command `python3 scripts/scheduled_ingestion.py`.
3. Set its schedule to `0 6 * * *` (daily at 06:00 UTC: 07:00 Vienna winter / 08:00 summer). Scheduling belongs in the Cron Job settings, not an environment variable. See [Render cron job documentation](https://render.com/docs/cronjobs). `render.yaml` provides the equivalent Blueprint definition.
4. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEBIUS_API_KEY`, and `NEBIUS_MODEL` on that cron service. Use the same Supabase project on the web service. Set `NEBIUS_BASE_URL` on the cron too if your web service uses a custom endpoint. `NEBIUS_INGEST_MODEL` optionally overrides the extraction model; it must support JSON responses. `INGEST_MAX_ARTICLES=20` limits article attempts per run (valid range 1–100).
5. Deploy this application-server change to the web service. No separate web rebuild is needed for subsequent data updates: browser graph/analytics, News and Ask read the shared snapshot. Server cache refreshes within 60 seconds; open browser tabs load graph updates on page reload.
6. Trigger **Run** once and inspect logs. The first run creates the shared snapshot. Missing credentials/table or failed rebuild stops publication and preserves the prior snapshot.

The existing Tavily cron can stay paused. RSS uses no Tavily credits. Nebius extraction uses inference credits. Never run multiple publishing cron services against the same snapshot: Render serializes runs of one cron service, but separate services could overwrite each other's state. To consolidate Tavily later, add `--tavily` to this same command and set `TAVILY_API_KEY`; leave the separate Tavily job paused. That flag performs paid discovery.

## Automatic admission

RSS discovers candidate funding articles. The job retrieves linked public articles from a restricted publisher list (PRNewswire, BusinessWire, Reuters), removes markup, and asks Nebius for structured facts and verbatim supporting passages. It checks those passages against retrieved text, then validates company, completed financing language, explicit financing date, one matching USD amount, named investors, headquarters country and AI-business evidence. Existing project schema/inclusion checks and duplicate checks still apply.

The initial admission policy intentionally covers unambiguous USD equity rounds from those publishers. It does not infer publication dates as financing dates, infer headquarters from a dateline, convert currencies without FX evidence, or admit valuation/debt/secondary/commitment amounts. Unsupported publishers and unresolved records remain in machine-managed retry state, outside graph totals. No person must approve them. Backoff increases from one day to a maximum of 30 days. Source access failures remain unresolved rather than being treated as verified.

This is a conservative first implementation, not universal automated fact checking. Cross-publisher corroboration, automatic discovery of company announcements, sourced currency conversion and broader country support remain future extensions. A model classification and matching passages reduce errors but do not guarantee that the underlying publication is correct. Blocked/paywalled Reuters articles will not pass. No arbitrary crawling or paid extraction API is used.

## Persistence and publication

A single service-role database row stores accepted automatic records, candidate/retry state, supporting passages, and the three generated public assets. The next ephemeral cron run restores accepted records before rebuilding, preventing data loss. Checked-in raw evidence is unchanged in Git; new records are appended only to the job's working copy. Conflicts with later checked-in changes stop publication instead of silently dropping evidence.

Publication replaces one database row only after a successful complete refresh, so graph/health/News come from one snapshot. The web server retains its last good snapshot on database errors and uses bundled data before any snapshot has been loaded. Public endpoints expose only generated assets; internal passages, candidates and retry state remain service-role only. This is a JSON snapshot approach for the current small dataset, not a large-scale ingestion store.

The existing admin review UI remains available for older workflows, but is not required by this job. Existing News watchlist signals remain separate from verified funding used in graph analytics. Inspect `payload.attempts` in Supabase for automatic retry reasons.

Validation: Python regression suite, Node HTTP integration tests (stubbed database/model), production web build, and an isolated full pipeline run adding a fixture company/investor/round. No paid APIs or production database were called during verification.

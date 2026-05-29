# Deployment

## Current Production Shape

The current deployable unit is the Node server in `web/server/app-server.mjs`.
It serves the Vite build from `web/dist/` and handles the backend API routes for
Ask, credits, Stripe Checkout, and Stripe webhooks.

Data is generated ahead of time into `web/public/data/*.json`, then bundled by
Vite. Ask requests are handled server-side so Nebius, Supabase service-role, and
Stripe secrets are never exposed to the browser.

## Build Locally

```bash
python3 scripts/validate_raw_data.py
python3 scripts/validate_market_events.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/init_startup_profiles.py
python3 scripts/build_app_graph.py
python3 scripts/build_market_events.py
cd web
npm ci
npm run build
```

The static files are written to `web/dist/`.

## Docker Deployment

```bash
cp .env.production.example .env
# edit .env and replace placeholders
cd web && npm run check:deploy-env
cd ..
docker compose -f docker-compose.prod.yml up --build
```

Then open:

```text
http://127.0.0.1:8080/
```

The production container builds the Vite app, serves `web/dist/`, and handles
the backend API routes:

- `/api/health`
- `/api/ask`
- `/api/ask/usage`
- `/api/credit-packs`
- `/api/checkout`
- `/api/stripe/webhook`

Do not put API keys in frontend `VITE_` variables. Runtime secrets should be
provided to the Node container through environment variables.

Health check:

```bash
curl http://127.0.0.1:8080/api/health
```

The response intentionally reports only whether services are configured, not the
secret values.

## Automated Data Refresh

Run data refresh outside the web container, then rebuild/redeploy the static
bundle:

```bash
python3 scripts/fetch_market_events_feeds.py
python3 scripts/validate_market_events.py
python3 scripts/build_market_events.py
cd web && npm run build
```

Check `data/app/market_event_fetch_report.json` after refreshes to see which
feeds succeeded, how many items matched, and how many rows were added.

For a real hosted product, move this into a scheduled CI job or backend worker
that writes to a database or object storage. The current CSV/JSON approach is
acceptable for a demo but not ideal for concurrent users or audit trails.

## Ask Assistant Metering

For a public launch, do not expose Nebius credentials in the browser. Run the
Ask endpoint as a server-side service and store `NEBIUS_API_KEY` as a deployment
secret.

The current proxy includes a credit-gated MVP:

```bash
ASK_REQUIRE_AUTH=true
ASK_CREDIT_USERS={"demo-token-1":{"user_id":"demo_user","credits":25,"plan":"starter"}}
ASK_CREDITS_PER_PROMPT=1
ASK_MAX_REQUESTS_PER_MINUTE=8
```

Users enter the access token in the Ask panel. The server deducts credits after
successful model responses, rate-limits requests per token, and writes local
usage records to `.ask_usage_log.jsonl`. This is a foundation for a Stripe
integration, not a complete billing system. For production, replace manual token
creation with account login, Stripe Checkout, and server-side credit top-ups.
See `docs/ASK_PAYWALL_PLAN.md` and `supabase/schema.sql` for the planned
Supabase/Postgres credit schema.

When Supabase is configured, set:

```bash
ASK_AUTH_PROVIDER=supabase
ASK_REQUIRE_AUTH=true
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
ADMIN_EMAILS=you@example.com
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
APP_PUBLIC_URL=https://aimarketgraph.com
```

The backend will verify the Supabase session token, read the user's Ask credit
balance from Postgres, and call `consume_ask_credits` after successful Nebius
responses.

Stripe credit packs are exposed at `/api/credit-packs`, Checkout sessions are
created at `/api/checkout`, and Stripe should send webhooks to
`/api/stripe/webhook`.

## Public Launch Checklist

- Use `ASK_AUTH_PROVIDER=supabase`; do not launch with local Ask auth.
- Use `ASK_REQUIRE_AUTH=true`.
- Run `cd web && npm run check:deploy-env` before deploying.
- Run Supabase schema from `supabase/schema.sql`.
- Add Supabase redirect URLs for `https://aimarketgraph.com` and
  `https://www.aimarketgraph.com`.
- Configure the Stripe webhook endpoint:
  `https://aimarketgraph.com/api/stripe/webhook`.
- Keep `.env` and host secrets out of git.
- Keep all source URLs visible.
- Keep `auto_ingested` events clearly labeled.
- Do not present investment recommendations.
- Add terms, privacy policy, and risk disclaimer before collecting users.
- Add monitoring for ingestion failures and failed builds.

## Domain DNS

After the host gives you a deployment target:

- point `aimarketgraph.com` to the host target;
- point `www.aimarketgraph.com` to the same app or configure it as a redirect;
- enable HTTPS on both hostnames;
- set `APP_PUBLIC_URL=https://aimarketgraph.com`;
- add both hostnames to Supabase auth redirects.

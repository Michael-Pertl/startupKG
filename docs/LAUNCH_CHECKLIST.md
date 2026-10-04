# Launch Checklist

Use this checklist before exposing `aimarketgraph.com` to external users.

## 1. Local Repository

```bash
git checkout main
git pull origin main
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
npm run check:deploy-env
```

`npm run check:deploy-env` is expected to fail until real production secrets are
configured. It should pass on the deployment host.

## 2. Supabase

- Create the production Supabase project.
- Run `supabase/schema.sql` in the SQL editor.
- Enable email auth.
- Enable Google auth only after the OAuth client is configured.
- Add redirect URLs:
  - `https://aimarketgraph.com`
  - `https://www.aimarketgraph.com`
- Copy these values into host secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `ADMIN_EMAILS`

## 3. Stripe

- Start in test mode.
- Create a credit product or use the app's dynamic credit packs.
- Configure webhook endpoint:
  `https://aimarketgraph.com/api/stripe/webhook`
- Subscribe to `checkout.session.completed`.
- Copy these values into host secrets:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`

## 4. Nebius

- Copy the Token Factory API key into the host as `NEBIUS_API_KEY`.
- Keep the key server-side only.
- Optional:
  - `NEBIUS_MODEL=moonshotai/Kimi-K2.5`
  - `NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/`

## 5. Required Production Secrets

Use `.env.production.example` as the source of truth. For public launch, these
must be set:

```text
APP_PUBLIC_URL=https://aimarketgraph.com
ASK_AUTH_PROVIDER=supabase
ASK_REQUIRE_AUTH=true
NEBIUS_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

## 6. Deployment Smoke Test

After deploying:

```bash
curl https://aimarketgraph.com/api/health
```

Then test in an incognito browser:

- homepage loads;
- graph data loads;
- News page loads;
- login works;
- Ask without credits is blocked;
- Stripe test checkout completes;
- credits appear after webhook delivery;
- one Ask response deducts credits.

## 7. Do Not Launch Until

- `python3 scripts/check_customer_readiness.py --require-ready` passes on current
  production reports; see `docs/CUSTOMER_READINESS.md` for data-specific gaps.

- Ask is not in local auth mode.
- Stripe webhooks work in test mode.
- Supabase trial credits appear for a new user.
- The app has a visible disclaimer that it is not investment advice.
- Source links remain visible for evidence-backed claims.

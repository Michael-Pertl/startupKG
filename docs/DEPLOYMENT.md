# Hackathon deployment

The Node server serves the React build and calls Nebius Token Factory from the server. Ask, graph lenses, analytics, and news are available without login or usage allowances. Optional Supabase accounts are only needed for administrator review.

```bash
cp .env.production.example .env
# Set NEBIUS_API_KEY in .env; never use a VITE_ variable for this secret.
cd web
npm ci
npm run check:deploy-env
npm run build
npm start
```

Open http://localhost:8080. Alternatively, from the repository root run `docker compose -f docker-compose.prod.yml up --build`. Generated graph files in `web/public/data/` are bundled in the build. Refresh them locally before rebuilding if needed; see the README pipeline instructions.

For development copy `web/.env.example` to `web/.env.local`, set the Nebius key, then run `npm run ask-server` and `npm run dev` in separate terminals inside `web/`.

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem.

## Ask provider configuration

In Render, set `NEBIUS_MODEL=moonshotai/Kimi-K2.6` and `NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/` in the service's Environment settings, then restart or redeploy. Render environment variables override the code defaults. Set `NEBIUS_API_KEY` to a valid Token Factory key there; never commit it.

For local development, update `web/.env.local` and restart the Ask server. This file loads before the root `.env`, so a stale key in it overrides a working root key. Remove the stale local key entry to use the root key, or replace it with a valid key.

Run `npm run check:deploy-env -- --check-models` inside `web/` to verify the configured model against the authenticated, read-only Nebius catalog without making an inference request. The `/api/health` response also shows the active model and base URL, but never the key. A 404 can mean an unavailable model or incorrect endpoint; a 401 indicates an authentication problem.

### Switching the Ask model on Render

Set `NEBIUS_MODEL` to the exact NVIDIA Nemotron identifier in your account's catalog and `NEBIUS_BASE_URL` to its API base URL (including `/v1`). Keep `NEBIUS_API_KEY` server-side. Save the environment changes and restart/redeploy the service. The server reads settings at startup.

`NEBIUS_REASONING_EFFORT` is optional and omitted by default; only set it when your selected model supports the parameter. Run `npm run check:deploy-env -- --check-models` with the same settings to check catalog access, then submit a real question in the deployed Ask panel to verify inference and a final answer. Regional endpoints and model access can differ between accounts; use [Nebius's model examples](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron) rather than assuming a model ID is available everywhere.

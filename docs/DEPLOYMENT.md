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

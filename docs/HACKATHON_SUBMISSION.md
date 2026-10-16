# AI Market Graph — hackathon submission kit

## Project pitch

AI Market Graph makes major AI investment networks explorable. Users navigate companies, funding rounds, investors, countries, regions, and AI domains, compare funding patterns in analytics, and follow source-linked market signals. A Nebius-powered assistant explains the selected entity and graph neighborhood using the published evidence.

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem. The core funding scope is 2024–2026, with rounds of USD 100M or equivalent and documented public sources. The market-events feed is a separate discovery layer and may contain items awaiting review.

## Nebius integration

The application calls Nebius Token Factory's chat completions endpoint from `web/server/app-server.mjs`. The default model is `moonshotai/Kimi-K2.6`; `NEBIUS_MODEL` and `NEBIUS_BASE_URL` can override it. For the hackathon, set `NEBIUS_MODEL` to the exact NVIDIA Nemotron model ID available to your key and use its matching API endpoint. The key stays on the server. Optional `NEBIUS_REASONING_EFFORT` is omitted unless configured, because supported parameters vary by model. The assistant receives selected entities and relationships resolved against the published graph, evidence metadata, and conversation history. Browser-supplied amounts cannot replace the published evidence.

All graph context lenses, analytics, source links, news, and Ask are available without an account. There are no subscription plans, payment flows, credit deductions, or trial allowances. Supabase is optional for the local demo and is used for persistent scheduled snapshots and authenticated administrator review.

## Judge setup

Use Node.js 22+ and Python 3.11+. The checked-in `web/public/data/` snapshot supports the demo without a running Neo4j instance; Neo4j import and Cypher analysis remain available for research.

```bash
cd web
npm ci
cp .env.example .env.local
# Edit .env.local: set NEBIUS_API_KEY, NEBIUS_MODEL and NEBIUS_BASE_URL.
npm run check:deploy-env -- --check-models
npm test
npm run build
npm start
```

Open http://localhost:8080. See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker and development startup. A working Nebius key is needed for live Ask responses. Without it, graph, analytics, and news still work and Ask reports the missing configuration.

## Three-minute demo outline

1. Explain the public-source mega-round scope and select a company in the graph.
2. Expand its funding and investor context lenses and open a round's source link.
3. Compare regions, years, domains, and confidence in Analytics; jump back into the graph.
4. Show market signals in News and distinguish reviewed evidence from discoveries.
5. Open Ask without signing in; ask it to explain the selected round and what the graph does not establish.

## Submission artifacts

Use the pitch above in the project description. Include the repository URL, a runnable demo or deployment URL, and a short video following the outline. Describe the Python curation pipeline, Neo4j property graph and Cypher analysis, React/Cytoscape UI, and server-side Nebius assistant.

The specific Nebius hackathon has not yet been identified. Confirm its deadline, eligibility, track, required Nebius usage, video format, and submission fields against its official rules. Add actual repository, deployment, and video links before submission. This document does not claim that the project has been submitted or that live provider access has been verified.

## Final submission checklist

If entering the [Nebius Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/rules), the published submission deadline is October 30, 2026 at 10:00 AM Pacific. Confirm this is your event before relying on that deadline.

- Select a track; Best Apps and Agents is a candidate for this app and requires Nemotron on Nebius.
- Deploy the branch after review, save the exact model ID in Render, and verify a real Ask response after the service restarts. Catalog verification alone does not prove inference access.
- Supply the public repository, working demo URL, English project description, and public YouTube demo under three minutes.
- The repository includes an [OSI-approved MIT license](../LICENSE) for original project source and documentation. Preserve third-party licenses and source attribution.
- Explain the significant changes made to this existing project after August 26, 2026: anonymous access, payment removal, analytics improvements, safer ingestion, updated evidence, and NVIDIA integration once verified.
- Keep the demo available to judges through December 15, 2026 and complete the requested tool feedback.

Record the deployed commit, model ID, successful Ask check, video URL and submission confirmation here once available. These are pending; local tests do not establish that Render is deployed or that the project has been submitted.

See [EVIDENCE_REVIEW_2026_10_12.md](EVIDENCE_REVIEW_2026_10_12.md) for this refresh's source decisions and coverage limitations. The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem.

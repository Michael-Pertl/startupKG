# AI Market Graph

Explore the money and connections behind AI: funding rounds, shared investors,
regional patterns, and source-linked market news. Ask questions about the current
view or retrieve investment connections across the published graph using a
Nebius Token Factory–powered assistant.

Built independently as a student knowledge-graph project and developed into a
hackathon application. Graph exploration, analytics, news, and Ask are available
without a subscription or account.

**Scope:** curated publicly reported AI mega-rounds of USD 100M or equivalent in
2024–2026, not the full AI startup ecosystem. Every funding event records a public
source, amount, date/year, investor evidence, and confidence. Coverage is
incomplete and regionally uneven.

## Quick start for judges

Requirements: **Node.js 22+**, **npm**, and **Python 3.11+** for data processing.
The checked-in graph snapshot runs without Neo4j, Supabase, or Tavily. A working
Nebius Token Factory key is required for live AI answers.

From a clone of this repository:

```bash
git clone https://github.com/Michael-Pertl/startupKG.git
cd startupKG/web
npm ci
cp .env.example .env.local
```

Edit `web/.env.local` and set these server-only variables:

```dotenv
NEBIUS_API_KEY=your_token_factory_key
NEBIUS_MODEL=exact_nvidia_nemotron_model_id_from_your_catalog
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/
```

Use the exact model ID and endpoint available to your Token Factory account;
see [Nebius's NVIDIA Nemotron examples](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron).
The model value above is a placeholder to replace, not a runnable model ID.
Never put the inference key in a `VITE_` variable or commit your `.env.local`.

Still inside `web/`:

```bash
npm run check:deploy-env -- --check-models
npm run build
npm start
```

Open **http://localhost:8080**. `--check-models` checks the authenticated catalog;
then submit a question in Ask to verify that inference produces an answer. Graph,
analytics, and news remain usable without a key; Ask reports missing configuration.

For hot-reloading development, run `npm run ask-server` and `npm run dev` in two
terminals inside `web/`, then open http://localhost:5173. Alternatively, `./start.sh`
from the repository root rebuilds existing data and starts the development app
at http://127.0.0.1:5180. It does not automatically fetch RSS or call Tavily.

## NVIDIA Nemotron and Nebius Token Factory

### Where NVIDIA models fit

The NVIDIA Nemotron integration uses Token Factory's chat completions API. The
server passes retrieved graph evidence and the user's question to the configured
model, which explains funding events, investor connections, and comparisons in
natural language. Two context modes are available:

- **Across the graph:** resolve named companies/investors and retrieve connected
  funding paths beyond the visible graph.
- **Current view only:** supply the selected entity and visible neighborhood.

Retrieval runs on the server against published evidence. Browser-supplied amounts
and sources cannot replace those records. The model is instructed to distinguish
source-backed facts from general explanations and hypothetical partnerships.
These instructions do not guarantee factual correctness or current ownership
information; Ask currently performs no live web verification.

The scheduled ingestion implementation also uses Token Factory to extract
structured funding facts and supporting passages from public articles. Python
checks those passages and applies deterministic eligibility, currency, duplicate,
and conflict rules before admitting records. `NEBIUS_INGEST_MODEL` optionally
selects a separate extraction model; otherwise ingestion uses `NEBIUS_MODEL`.

Implementation references:

| Component | Location |
| --- | --- |
| Server-side Ask inference | [`web/server/app-server.mjs`](web/server/app-server.mjs) |
| Published evidence and scope enforcement | [`web/server/canonical-context.mjs`](web/server/canonical-context.mjs) |
| Shared-investor path retrieval | [`web/server/graph-retrieval.mjs`](web/server/graph-retrieval.mjs) |
| Structured extraction and source-passage checks | [`scripts/verify_market_evidence.py`](scripts/verify_market_evidence.py) |
| Scheduled ingestion and snapshot publication | [`scripts/scheduled_ingestion.py`](scripts/scheduled_ingestion.py) |

**Model verification status:** the integration is configurable for NVIDIA Nemotron.
The code's fallback is `moonshotai/Kimi-K2.6`, which is not an NVIDIA model. Set
`NEBIUS_MODEL` explicitly to your chosen Nemotron ID on the deployed web service
and cron service. A Render environment change is not recorded in this repository;
the exact deployed model and successful NVIDIA inference have not been verified
here. `/api/health` exposes the configured model without the API key, and a
successful `/api/ask` response includes the model ID. Record a successful deployed
response before presenting NVIDIA model use as verified to judges.

### How Token Factory accelerated development

Token Factory provides hosted inference, so the project can call a model without
provisioning GPUs, downloading weights, or operating an inference server. The
same chat-completions interface supports the interactive assistant and the
structured extraction pipeline. Model and endpoint settings are environment
variables, allowing model changes without rebuilding the retrieval logic or UI.
This let development focus on evidence quality, graph retrieval, and the user
experience. No measured latency or cost improvement is claimed.

The Nebius service integrated in this repository is **Token Factory**. Application
hosting and scheduled jobs use **Render**, and optional persistence uses
**Supabase**; those are separate services. No direct Nebius AI Cloud GPU cluster,
Nebius storage service, model training, or fine-tuning is implemented.

## What to explore

- **Graph:** navigate companies, rounds, investors, domains, countries, and regions;
  inspect evidence and follow shared-investor connections.
- **Analytics:** compare funding, investors, and source-linked rounds with year and
  region filters.
- **News:** search public market signals and optionally include unverified discoveries.
- **Ask:** ask a graph question with either visible context or broader graph retrieval.

A useful demo starts with Nebius: open its funding rounds, inspect investors,
then ask which other companies share those investors. Connections show reported
funding participation; they do not establish investor cheque sizes, confirmed
partnerships, or acquisition availability.

## Architecture and stack

```text
Public funding evidence / RSS / optional Tavily
                 |
Python validation, normalization and graph exports
                 |                     |
Neo4j + Cypher research         Published JSON snapshots
                                       |
                         React + TypeScript + Cytoscape.js
                                       |
                              Node.js application server
                                       |
                           Nebius Token Factory inference
```

Neo4j models startups, investors, funding rounds, AI domains, geography, and time.
The web application reads generated graph JSON; it does not query Neo4j live.
Optional Supabase snapshots allow scheduled updates to reach the deployed app.

```text
(:Startup)-[:RAISED]->(:FundingRound)
(:Investor)-[:PARTICIPATED_IN {role}]->(:FundingRound)
(:Startup)-[:OPERATES_IN {role}]->(:AIDomain)
(:Startup)-[:HEADQUARTERED_IN]->(:Country)
(:Country)-[:PART_OF]->(:Region)
```

## Reproduce the data pipeline

From the repository root:

```bash
python3 scripts/refresh_platform.py
```

This validates existing evidence, ingests complete structured inbox records,
normalizes tables, and rebuilds graph, growth metrics, news, and health reports.
It does not make discovery calls by default. Individual core steps are:

```bash
python3 scripts/validate_raw_data.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/build_app_graph.py
python3 scripts/build_market_events.py
```

Raw evidence lives in `data/raw/`; processed tables in `data/processed/`; Neo4j
import files in `data/neo4j_import/`; public app exports in `web/public/data/`.
Stage additional structured funding evidence in `data/raw/new_funding_events.csv`.
See [automatic ingestion](docs/AUTOMATIC_INGESTION.md) for eligibility and
quarantine rules. The optional Streamlit research prototype uses dependencies
from `requirements.txt`; these are not required for the Node web demo.

To use Neo4j locally, install Docker Compose and run `docker compose up -d` from
the repository root. Follow [the Neo4j model](docs/NEO4J_MODEL.md) and import scripts
under `scripts/`; use queries under `queries/` for analysis. The checked-in Compose
password is for local development only.

## Daily updates and deployment

Deploy the Node server using [deployment instructions](docs/DEPLOYMENT.md).
For persistent automatic updates, first apply
[`supabase/migrations/20261015_platform_snapshots.sql`](supabase/migrations/20261015_platform_snapshots.sql),
then configure **one** Render Cron Job:

```text
Schedule: 0 6 * * *
Command:  python3 scripts/scheduled_ingestion.py
```

This is daily at 06:00 UTC. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEBIUS_API_KEY`, and `NEBIUS_MODEL` on the job, and use the same Supabase project
on the web service. The service-role key is server-only. Add `--tavily` and
`TAVILY_API_KEY` only to opt into paid Tavily discovery. RSS discovery does not
use Tavily credits; extraction uses Nebius inference. `render.yaml` contains the
job definition. See [scheduled ingestion](docs/SCHEDULED_INGESTION.md) for setup,
retry behavior, source restrictions, and publication details.

Initial automatic admission covers explicit USD funding announcements from
PRNewswire, BusinessWire, and Reuters. Unresolved records retry without mandatory
human review and remain outside graph totals. Cross-source corroboration,
automatic ownership/acquisition enrichment, sourced FX conversion, and live
ownership checks in Ask are not implemented.

## Validation

```bash
# Repository root
python3 -m unittest discover -s tests

# Web application
cd web
npm ci
npm test
npm run build
```

Provider tests use local stubs rather than paid inference. Catalog and real
inference checks require your own Token Factory credentials.

## License

Original project source code and documentation are licensed under the
**[MIT License](LICENSE)**, an
[OSI-approved open-source license](https://opensource.org/license/mit).
The standard license text is included in the repository; no separate OSI
application or purchase is needed to use it.

Third-party dependencies, NVIDIA model weights, provider services, linked
articles, company logos, and publisher content retain their own licenses and
terms. This project's MIT license does not grant rights to those materials.
Public source URLs are retained for attribution and verification.

## Further documentation

- [Hackathon submission and demo guide](docs/HACKATHON_SUBMISSION.md)
- [Project scope](docs/PROJECT_SCOPE.md)
- [Data acquisition](docs/DATA_ACQUISITION.md)
- [Data schema](docs/DATA_SCHEMA.md)
- [Analysis plan](docs/ANALYSIS_PLAN.md)
- [GitHub contribution and PR workflow](GITHUB.md)

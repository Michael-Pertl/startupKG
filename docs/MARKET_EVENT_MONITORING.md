# Market Event Monitoring

## Goal

Extend the AI market graph from a static research dataset into a monitored
market-intelligence tool. The system should notify users when public evidence
indicates that an AI company:

- raises a new large funding round;
- reports a major valuation increase;
- files to go public, prices an IPO, de-SPACs, or begins public trading;
- receives a major strategic investment or compute/infrastructure commitment.

The product should surface public information quickly and clearly. It must not
present alerts as personalized investment advice or trading recommendations.

## Event Types

Use a separate event layer rather than overloading funding rounds.

Recommended event types:

- `funding_round`
- `valuation_update`
- `ipo_filing`
- `ipo_pricing`
- `public_listing`
- `strategic_investment`
- `compute_commitment`
- `acquisition_or_merger`
- `major_partnership`
- `revenue_or_usage_milestone`

Each event should keep source evidence, source confidence, event date, affected
company, and affected investors or counterparties where available.

## Alert Value

Useful alerts are not just “news happened.” They should explain why the event
matters in the graph:

- company has repeated mega-round momentum;
- valuation increased meaningfully versus the last sourced valuation;
- investor set changed, for example a new strategic investor entered;
- country, domain, or region now has a new capital leader;
- private company is becoming investable through a public listing;
- public-company exposure may exist through investors, partners, suppliers, or
  listed parent companies.

The app should separate facts from interpretation:

- Fact: “Company X filed an S-1 on YYYY-MM-DD.”
- Graph context: “The company is connected to investors A, B, C and has visible
  mega-round funding of USD N in this dataset.”
- User action: “Review source and related public-market exposure.”

Do not say “buy”, “sell”, “undervalued”, or “guaranteed upside.”

## Notification Workflow

Recommended architecture:

1. Source discovery
   - Use curated RSS/news feeds, company press pages, SEC/EDGAR filings, stock
     exchange notices, reputable financial news, and selected public startup
     databases.
   - Do not depend on paywalled/private data as the primary source.

2. Candidate staging
   - Store new candidates in a staging table, not directly in the production
     graph.
   - Require `source_url`, `event_date`, `event_type`, `company`, `confidence`,
     and a short machine-readable summary.

3. Validation
   - Validate required fields.
   - Check duplicate source URLs and duplicate company/date/event-type
     combinations.
   - Compare the event against existing funding, valuation, IPO, and profile
     records.

4. Human review
   - For now, require manual approval before alerts become visible.
   - The reviewer decides whether the event is graph-grade evidence or only a
     watchlist note.

5. Graph update
   - Add approved events to the appropriate raw table.
   - Rebuild processed data and `market_graph.json`.
   - Preserve every source URL.

6. Notification delivery
   - In-app notification center.
   - Saved watchlists by company, investor, country, domain, and event type.
   - Optional email/Slack/Discord webhook later.

## Minimum Data Tables

### `market_events_raw.csv`

```csv
event_id,company_name,event_type,event_date,year,country,region,amount_usd,valuation_usd,source_url,source_type,confidence,status,summary,notes
```

Recommended `status` values:

- `staged`
- `auto_ingested`
- `approved`
- `rejected`
- `needs_review`

`auto_ingested` rows are visible in the News tab but have not been manually
reviewed. They should not be promoted into the core funding graph until a
source URL, date, event type, amount/valuation where applicable, and company
identity are checked.

The app also assigns visible events to investor-facing signal tiers:

- `core_signal`: manually reviewed events that can support the core market
  monitor, such as approved mega-rounds, strategic investments, IPO filings,
  IPO pricings, and public listings.
- `watchlist_signal`: broader investor-relevant context such as IPO watch
  items, major partnerships, valuation updates, acquisitions, and
  below-threshold funding signals.
- `review_queue`: unreviewed or automatically discovered items that need manual
  source and company checks before being used as evidence.

These tiers are app metadata. They do not change the Neo4j funding graph
inclusion rules.

### `alert_rules.csv`

```csv
rule_id,user_id,rule_type,entity_type,entity_value,event_types,min_amount_usd,min_valuation_delta_usd,min_confidence,is_active,created_at
```

Example rule types:

- `watch_company`
- `watch_investor`
- `watch_country`
- `watch_domain`
- `watch_ipo_events`
- `watch_mega_rounds`
- `watch_valuation_stepups`

### `notifications.csv`

```csv
notification_id,rule_id,event_id,created_at,seen_at,severity,title,body,source_url
```

Recommended severity:

- `info`
- `important`
- `urgent`

## Alert Examples

### New Mega-Round

Trigger:

- event type is `funding_round`;
- `amount_usd >= 100000000`;
- confidence is `high` or `medium`.

Notification:

```text
New AI mega-round: <Company> raised <amount>.
Why it matters: <Company> is in <domain>, headquartered in <country>, and now has <N> visible mega-round events in the graph.
Source: <source_url>
```

### Valuation Step-Up

Trigger:

- event type is `valuation_update` or a funding round with a sourced
  post-money valuation;
- latest valuation is at least 50% higher than the previous sourced valuation,
  or increases by at least USD 1B.

Notification:

```text
Valuation step-up: <Company> was reported at <valuation>.
Previous sourced valuation: <previous valuation>.
Source: <source_url>
```

### IPO / Public Listing

Trigger:

- event type is `ipo_filing`, `ipo_pricing`, or `public_listing`.

Notification:

```text
Public-market transition: <Company> <filed/priced/listed>.
Why it matters: private AI graph entity may now be trackable as a public security or through a listed parent/vehicle.
Source: <source_url>
```

## App Implementation

Short term:

- Add `market_events_raw.csv` and validation.
- Add an admin review script for staged events.
- Add an in-app “Updates” panel sorted by event date and severity.
- Add watchlist rules stored locally as JSON/CSV.
- Free automated discovery from configured RSS feeds:

```bash
python3 scripts/fetch_market_events_feeds.py
python3 scripts/build_market_events.py
```

Feed sources are configured in `data/raw/market_event_feeds.csv`. The RSS
script filters for AI plus market-event keywords, deduplicates by source URL
and company/date/type, and appends new rows with `status=auto_ingested`.
Funding items with a detected amount below USD100M and low-signal announcements
are written with `status=staged`, which keeps the audit trail while hiding them
from the News tab. Funding items with no detected amount are written as
`needs_review` so the amount can be checked manually. Each RSS run writes a
compact health report to `data/app/market_event_fetch_report.json`.

- Optional paid discovery with Tavily:

```bash
export TAVILY_API_KEY=tvly-your-key
python3 scripts/fetch_market_events_tavily.py
python3 scripts/build_market_events.py
```

The Tavily script searches public web/news results, classifies likely market
events, deduplicates by source URL and company/date/type, and appends new rows
with `status=auto_ingested`. These rows are visible in News but remain separate
from the core Neo4j funding graph.

To promote a reviewed market event into the formal funding-event staging file,
use:

```bash
python3 scripts/promote_market_event.py <market_event_id> \
  --lead-investors "Investor A; Investor B" \
  --ai-domain "AI Infrastructure"
python3 scripts/promote_market_event.py <market_event_id> \
  --lead-investors "Investor A; Investor B" \
  --ai-domain "AI Infrastructure" \
  --apply
```

The helper prints a funding-row dry run by default and validates it against the
same schema as `data/raw/funding_events_raw.csv`. After `--apply`, review
`data/raw/new_funding_events.csv`, then run `scripts/ingest_funding_events.py`
and the normal graph rebuild pipeline.

For unattended local updates, run the same commands from cron or Task Scheduler.
For example, every six hours:

```cron
0 */6 * * * cd /path/to/project && python3 scripts/fetch_market_events_feeds.py && python3 scripts/build_market_events.py
```

Medium term:

- Add FastAPI backend endpoints:
  - `GET /events`
  - `POST /watchlist`
  - `GET /notifications`
  - `POST /notifications/{id}/seen`
- Add scheduled jobs for public feed polling.
- Add diffing against existing company valuation and funding history.

Long term:

- User accounts and persistent watchlists.
- Email/webhook delivery.
- Entity-level public-market exposure graph, clearly marked as research context
  rather than investment advice.

## Compliance Guardrails

The product can help users discover public market-moving information, but it
should not make individualized investment recommendations.

Required UI wording:

- “Public source alert, not investment advice.”
- “Verify the source before making financial decisions.”
- “The graph may be incomplete or delayed.”

Alerts should link to source evidence and explain graph context. They should not
predict returns or recommend trades.

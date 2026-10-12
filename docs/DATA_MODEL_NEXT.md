# Data Model Next

The current dataset models publicly reported funding events. A market-grade app needs more than funding rounds.

## Current Limitation

The app currently answers:

> Which publicly reported AI funding events above USD100M are in the curated dataset?

It does not yet answer:

> Which companies are actually closest in scale, traction, capital access, valuation, adoption, and strategic importance?

It also does not yet answer:

> Which companies just raised a new major round, reported a valuation step-up, or moved toward public-market access?

This matters for companies such as Anthropic and OpenAI. Anthropic's latest public Series G is already present as a USD30B event, while OpenAI's latest public 2026 financing is present as USD110B. However, the app does not yet show valuation history, revenue run-rate, user adoption, older strategic funding, or compute commitments as separate metrics.

## New Tables

Add these tables before making stronger product claims.

### `company_metrics.csv`

One row per company and observation date.

```text
metric_id
startup_id
metric_date
year
metric_type
metric_value
metric_unit
source_url
source_type
confidence
notes
```

Examples for `metric_type`:

- `valuation_post_money_usd`
- `valuation_pre_money_usd`
- `annualized_revenue_usd`
- `weekly_active_users`
- `employee_count`
- `total_funding_reported_usd`

### `historical_funding_events_raw.csv`

Use the existing placeholder table for pre-2024 and sub-USD100M events where they are important to company history.

Keep them separate from the 2024-2026 mega-round analysis so the original research question remains reproducible.

### `ecosystem_companies.csv`

One row per important AI company, including watchlist companies.

```text
startup_id
name
country
region
primary_domain
ecosystem_tier
coverage_status
why_important
website
profile_source_url
confidence
```

Recommended `ecosystem_tier` values:

- `frontier_lab`
- `foundation_model_company`
- `ai_infrastructure`
- `ai_application_leader`
- `robotics_physical_ai`
- `defense_security_ai`
- `chips_compute`
- `regional_champion`
- `watchlist`

Recommended `coverage_status` values:

- `event_history_verified`
- `partial_history`
- `profile_only`
- `watchlist_needs_review`
- `excluded`

### `market_events_raw.csv`

One row per public market-relevant event that should be considered for graph
updates or user notifications. This is broader than the funding-round table.

```text
event_id
company_name
event_type
event_date
year
country
region
amount_usd
valuation_usd
source_url
source_type
confidence
status
summary
notes
```

Recommended `event_type` values:

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

Recommended `status` values:

- `staged`
- `approved`
- `rejected`
- `needs_review`

Approved `funding_round` events above the funding threshold should eventually
flow into `funding_events_raw.csv`. Valuation and IPO events should remain as
separate event/metric records so the app does not confuse amount raised with
company value or public-market availability.

### `alert_rules.csv`

User watchlist and notification rules.

```text
rule_id
user_id
rule_type
entity_type
entity_value
event_types
min_amount_usd
min_valuation_delta_usd
min_confidence
is_active
created_at
```

### `notifications.csv`

Generated user-facing notifications.

```text
notification_id
rule_id
event_id
created_at
seen_at
severity
title
body
source_url
```

## App Semantics

The app should show three different numbers for a company:

- `Visible mega-round funding`: sum of imported funding events above USD100M in the selected window.
- `Reported total funding`: sourced company-level total funding, where available.
- `Latest reported valuation`: sourced valuation metric, where available.

These must not be merged into one number.

The app should also distinguish:

- funding round event;
- valuation datapoint;
- IPO or public listing event;
- notification generated from a watchlist rule.

Notifications should be source-backed public-information alerts, not investment
recommendations.

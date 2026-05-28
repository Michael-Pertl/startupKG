# Ask Paywall Plan

## Target Architecture

```text
React app
  -> Supabase Auth session
  -> Backend /api/ask
  -> Supabase Postgres credit check
  -> Nebius Token Factory
  -> Supabase Postgres usage + credit deduction
```

Stripe should be used for monthly subscriptions. Nebius credentials and Stripe
secrets must stay server-side.

## Tables

The initial schema lives in `supabase/schema.sql`.

- `profiles`: public app profile for each Supabase Auth user.
- `ask_credit_accounts`: current Ask credit balance per user.
- `ask_credit_ledger`: immutable credit movement log.
- `ask_usage_events`: one row per Ask attempt/result.
- `stripe_events`: processed Stripe webhook events for idempotency.

New users receive 10 trial Ask questions through the auth trigger in
`supabase/schema.sql`.

## Credit Flow

1. User signs in through Supabase Auth.
2. Frontend sends the Supabase access token to `/api/ask`.
3. Backend verifies the token with Supabase.
4. Backend checks `ask_credit_accounts.credits_remaining`.
5. Backend calls Nebius only if credits are available.
6. Backend records token usage in `ask_usage_events`.
7. Backend deducts credits through `consume_ask_credits`.
8. Frontend receives the answer and updated credit balance.

For production, credit deduction should happen in a transaction after a
successful model response. If the model call fails, do not charge the user.

## Subscription Model

Initial public-facing plans:

```text
Free
- Limited graph preview
- Selected analytics and news
- 10 Ask questions total

Starter, EUR 4.99/month
- Full graph access
- Full analytics and news
- 75 Ask questions/month

Pro, EUR 9.99/month
- Full graph access
- Full analytics and news
- Unlimited Ask under fair use
```

The Pro plan should still have an internal fair-use cap, for example 500 Ask
questions/month, so model costs and abuse risk remain bounded.

## Current Stripe Flow

The current backend still supports one-time credit-style Checkout sessions. This
is useful for testing Stripe webhooks and credit granting, but it is not the
target subscription product.

1. User selects a legacy credit pack in the app.
2. Backend creates a Stripe Checkout Session.
3. Stripe redirects the user to payment.
4. Stripe webhook sends `checkout.session.completed`.
5. Backend verifies the webhook signature.
6. Backend checks `stripe_events` to avoid double-processing.
7. Backend calls `grant_ask_credits`.
8. User sees the new balance after refresh or realtime update.

Legacy test packs:

```text
Starter:  €5  ->  50 credits
Research: €15 -> 200 credits
Team:     €49 -> 800 credits
```

The next billing implementation should replace these packs with Stripe
subscriptions and grant monthly Ask allowance on successful invoice payment.

## Required Production Environment

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_PUBLIC_URL=
NEBIUS_API_KEY=
NEBIUS_MODEL=moonshotai/Kimi-K2.5
ASK_CREDITS_PER_PROMPT=1
ASK_MAX_REQUESTS_PER_MINUTE=8
ASK_AUTH_PROVIDER=supabase
```

Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the browser. Use
`SUPABASE_SERVICE_ROLE_KEY` only in the backend.

The local development proxy still supports `ASK_AUTH_PROVIDER=local`, which
uses `.ask_ledger.json`. Production should use `ASK_AUTH_PROVIDER=supabase` so
the backend verifies a Supabase access token, reads the user's balance from
Postgres, and deducts credits through `consume_ask_credits`.

## Launch Guardrails

- Never expose `NEBIUS_API_KEY`, `STRIPE_SECRET_KEY`, or
  `SUPABASE_SERVICE_ROLE_KEY` to the frontend.
- Keep Ask answers marked as generated market intelligence, not investment
  advice.
- Rate-limit by authenticated user and IP.
- Cap request body size and context size.
- Log usage metadata and model failures, but avoid storing full user prompts
  unless you have a privacy policy that covers it.
- Keep the curated graph caveat visible: the dataset is public-source
  AI mega-round intelligence, not complete market coverage.

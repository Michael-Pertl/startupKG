import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

for (const envPath of [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env.local"),
  resolve(process.cwd(), "..", ".env"),
]) {
  loadEnvFile(envPath);
}

const PORT = Number(process.env.PORT || process.env.GRAPH_ASSISTANT_PORT || 8080);
const DIST_DIR = resolve(process.cwd(), process.env.STATIC_DIR || "dist");
const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/";
const MODEL = process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.5";
const ASK_REQUIRE_AUTH = (process.env.ASK_REQUIRE_AUTH || "false").toLowerCase() === "true";
const ASK_CREDITS_PER_PROMPT = Number(process.env.ASK_CREDITS_PER_PROMPT || 1);
const ASK_MONTHLY_FREE_CREDITS = Number(process.env.ASK_MONTHLY_FREE_CREDITS || 25);
const ASK_MAX_REQUESTS_PER_MINUTE = Number(process.env.ASK_MAX_REQUESTS_PER_MINUTE || 8);
const ASK_LEDGER_FILE = resolve(process.cwd(), process.env.ASK_LEDGER_FILE || ".ask_ledger.json");
const ASK_USAGE_LOG_FILE = resolve(process.cwd(), process.env.ASK_USAGE_LOG_FILE || ".ask_usage_log.jsonl");
const ASK_AUTH_PROVIDER = process.env.ASK_AUTH_PROVIDER || "local";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID || "";
const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://127.0.0.1:5173";
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const SUBSCRIPTION_PLANS = {
  starter: {
    label: "Starter",
    price_id: STRIPE_STARTER_PRICE_ID,
    amount_cents: 499,
    currency: "eur",
    monthly_credits: 75,
  },
  pro: {
    label: "Pro",
    price_id: STRIPE_PRO_PRICE_ID,
    amount_cents: 1999,
    currency: "eur",
    monthly_credits: 500,
  },
};
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" }) : null;
const rateBuckets = new Map();

function configStatus() {
  return {
    auth_provider: ASK_AUTH_PROVIDER,
    ask_auth_required: ASK_REQUIRE_AUTH,
    nebius_configured: Boolean(process.env.NEBIUS_API_KEY),
    supabase_configured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    stripe_configured: Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET),
    stripe_subscription_prices_configured: Boolean(STRIPE_STARTER_PRICE_ID && STRIPE_PRO_PRICE_ID),
    admin_review_configured: ADMIN_EMAILS.size > 0,
    app_public_url: APP_PUBLIC_URL,
    static_dir: DIST_DIR,
  };
}

function stableMonth() {
  return new Date().toISOString().slice(0, 7);
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(path, payload) {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function appendJsonLine(path, payload) {
  writeFileSync(path, `${JSON.stringify(payload)}\n`, { encoding: "utf8", flag: "a" });
}

function configuredUsers() {
  const users = {};
  const rawJson = process.env.ASK_CREDIT_USERS || "";
  if (rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson);
      for (const [token, config] of Object.entries(parsed)) {
        users[token] = {
          user_id: config.user_id || config.userId || `user_${token.slice(0, 8)}`,
          credits: Number(config.credits || ASK_MONTHLY_FREE_CREDITS),
          plan: config.plan || "manual",
        };
      }
    } catch (error) {
      console.warn(`ASK_CREDIT_USERS is not valid JSON: ${error.message}`);
    }
  }
  const rawTokens = process.env.ASK_ACCESS_TOKENS || "";
  rawTokens
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      users[token] ||= {
        user_id: `user_${token.slice(0, 8)}`,
        credits: ASK_MONTHLY_FREE_CREDITS,
        plan: "manual",
      };
    });
  return users;
}

function loadLedger() {
  const ledger = readJsonFile(ASK_LEDGER_FILE, { users: {} });
  ledger.users ||= {};
  const seeded = configuredUsers();
  const month = stableMonth();
  for (const [token, config] of Object.entries(seeded)) {
    ledger.users[token] ||= {
      user_id: config.user_id,
      plan: config.plan,
      credits_remaining: config.credits,
      credits_granted: config.credits,
      current_month: month,
      request_timestamps: [],
    };
    ledger.users[token].user_id ||= config.user_id;
    ledger.users[token].plan ||= config.plan;
  }
  return ledger;
}

function saveLedger(ledger) {
  writeJsonFile(ASK_LEDGER_FILE, ledger);
}

function tokenFromRequest(request) {
  const header = request.headers["x-ask-token"] || request.headers.authorization || "";
  const value = Array.isArray(header) ? header[0] : header;
  return value.replace(/^Bearer\s+/i, "").trim();
}

function checkRateLimit(key) {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((timestamp) => now - timestamp < 60_000);
  if (timestamps.length >= ASK_MAX_REQUESTS_PER_MINUTE) {
    rateBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}

async function getSupabaseProfile(userId) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("plan, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, monthly_ask_limit")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn(`Could not read Supabase profile for ${userId}: ${error.message}`);
    return null;
  }
  return data || null;
}

async function ensureSupabaseUser(request) {
  if (!supabaseAdmin) {
    return { error: { status: 503, message: "Supabase backend credentials are not configured." } };
  }
  const accessToken = tokenFromRequest(request);
  if (!accessToken) {
    return { error: { status: 401, message: "Supabase session token is missing." } };
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return { error: { status: 401, message: "Supabase session token is invalid." } };
  }
  const userId = userData.user.id;
  const profile = await getSupabaseProfile(userId);
  const { data: balanceData, error: balanceError } = await supabaseAdmin.rpc("get_ask_credit_balance", {
    target_user_id: userId,
  });
  if (balanceError) {
    return { error: { status: 500, message: `Could not read Ask credits: ${balanceError.message}` } };
  }
  return {
    provider: "supabase",
    accessToken,
    user: {
      user_id: userId,
      email: userData.user.email,
      plan: profile?.plan || "free",
      subscription_status: profile?.subscription_status || "trial",
      stripe_customer_id: profile?.stripe_customer_id || null,
      stripe_subscription_id: profile?.stripe_subscription_id || null,
      current_period_end: profile?.current_period_end || null,
      monthly_ask_limit: profile?.monthly_ask_limit || null,
      credits_remaining: Number(balanceData || 0),
      request_timestamps: [],
    },
  };
}

function ensureLocalUser(request) {
  const ledger = loadLedger();
  if (!ASK_REQUIRE_AUTH) {
    const token = "local_dev";
    ledger.users[token] ||= {
      user_id: "local_dev",
      plan: "local",
      credits_remaining: 1_000_000,
      credits_granted: 1_000_000,
      current_month: stableMonth(),
      request_timestamps: [],
    };
    saveLedger(ledger);
    return { provider: "local", ledger, token, user: ledger.users[token] };
  }

  const token = tokenFromRequest(request);
  if (!token || !ledger.users[token]) {
    return { provider: "local", ledger, token, error: { status: 401, message: "Ask access token is missing or invalid." } };
  }
  const user = ledger.users[token];
  user.request_timestamps ||= [];
  return { provider: "local", ledger, token, user };
}

async function ensureUser(request) {
  if (ASK_AUTH_PROVIDER === "supabase") return ensureSupabaseUser(request);
  return ensureLocalUser(request);
}

async function ensureAdminUser(request) {
  const auth = await ensureSupabaseUser(request);
  if (auth.error) return auth;
  const email = String(auth.user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.size || !ADMIN_EMAILS.has(email)) {
    return { error: { status: 403, message: "Admin access is not enabled for this account." } };
  }
  return auth;
}

function checkCreditsAndRateLimit(user, provider = "local") {
  if (provider === "supabase") {
    if (!checkRateLimit(user.user_id)) {
      return { status: 429, message: "Ask rate limit reached. Try again in a minute." };
    }
    if (Number(user.credits_remaining || 0) < ASK_CREDITS_PER_PROMPT) {
      return { status: 402, message: "No Ask credits remaining. Please top up your account." };
    }
    return null;
  }
  const now = Date.now();
  user.request_timestamps = (user.request_timestamps || []).filter((timestamp) => now - timestamp < 60_000);
  if (user.request_timestamps.length >= ASK_MAX_REQUESTS_PER_MINUTE) {
    return { status: 429, message: "Ask rate limit reached. Try again in a minute." };
  }
  if (Number(user.credits_remaining || 0) < ASK_CREDITS_PER_PROMPT) {
    return { status: 402, message: "No Ask credits remaining. Please top up your account." };
  }
  return null;
}

function chargeUser(user, usage) {
  user.credits_remaining = Number(user.credits_remaining || 0) - ASK_CREDITS_PER_PROMPT;
  user.request_timestamps = [...(user.request_timestamps || []), Date.now()];
  user.last_request_at = new Date().toISOString();
  user.last_usage = usage;
}

async function consumeSupabaseCredits(user, selected, question, usage) {
  const metadata = {
    model: MODEL,
    prompt_tokens: String(usage.prompt_tokens || ""),
    completion_tokens: String(usage.completion_tokens || ""),
    total_tokens: String(usage.total_tokens || ""),
    selected_entity_id: selected.id || "",
    selected_entity_label: selected.label || "",
    question_chars: String(question.length),
  };
  const { data, error } = await supabaseAdmin.rpc("consume_ask_credits", {
    target_user_id: user.user_id,
    credit_amount: ASK_CREDITS_PER_PROMPT,
    usage_metadata: metadata,
  });
  if (error) throw new Error(`Could not deduct Ask credits: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  user.credits_remaining = Number(row?.balance_after ?? user.credits_remaining - ASK_CREDITS_PER_PROMPT);
  return row;
}

function publicUsage(user) {
  return {
    user_id: user.user_id,
    plan: user.plan,
    subscription_status: user.subscription_status,
    current_period_end: user.current_period_end,
    monthly_ask_limit: user.monthly_ask_limit,
    credits_remaining: Number(user.credits_remaining || 0),
    credits_per_prompt: ASK_CREDITS_PER_PROMPT,
    requests_last_minute: (user.request_timestamps || []).filter((timestamp) => Date.now() - timestamp < 60_000).length,
    max_requests_per_minute: ASK_MAX_REQUESTS_PER_MINUTE,
  };
}

async function createCheckoutSession(request) {
  if (!stripe) {
    return { error: { status: 503, message: "Stripe is not configured." } };
  }
  if (!supabaseAdmin) {
    return { error: { status: 503, message: "Supabase backend credentials are not configured." } };
  }
  const auth = await ensureSupabaseUser(request);
  if (auth.error) return auth;
  const body = JSON.parse(await readBody(request));
  const planId = String(body.plan_id || body.pack_id || "starter");
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    return { error: { status: 400, message: "Unknown subscription plan." } };
  }
  if (!plan.price_id) {
    return { error: { status: 503, message: `Stripe price ID is not configured for the ${plan.label} plan.` } };
  }

  const sessionParams = {
    mode: "subscription",
    success_url: `${APP_PUBLIC_URL}/?checkout=success`,
    cancel_url: `${APP_PUBLIC_URL}/?checkout=cancelled`,
    client_reference_id: auth.user.user_id,
    allow_promotion_codes: true,
    line_items: [
      {
        price: plan.price_id,
        quantity: 1,
      },
    ],
    metadata: {
      user_id: auth.user.user_id,
      plan_id: planId,
      monthly_credits: String(plan.monthly_credits),
    },
    subscription_data: {
      metadata: {
        user_id: auth.user.user_id,
        plan_id: planId,
        monthly_credits: String(plan.monthly_credits),
      },
    },
  };

  if (auth.user.stripe_customer_id) {
    sessionParams.customer = auth.user.stripe_customer_id;
  } else if (auth.user.email || body.email) {
    sessionParams.customer_email = body.email || auth.user.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return { session };
}

async function createBillingPortalSession(request) {
  if (!stripe) {
    return { error: { status: 503, message: "Stripe is not configured." } };
  }
  const auth = await ensureSupabaseUser(request);
  if (auth.error) return auth;
  if (!auth.user.stripe_customer_id) {
    return { error: { status: 400, message: "No Stripe customer is linked to this account yet." } };
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: auth.user.stripe_customer_id,
    return_url: `${APP_PUBLIC_URL}/account`,
  });
  return { session };
}

function planIdFromPriceId(priceId) {
  for (const [planId, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (plan.price_id && plan.price_id === priceId) return planId;
  }
  return "";
}

function subscriptionIdFromInvoice(invoice) {
  if (typeof invoice.subscription === "string") return invoice.subscription;
  if (invoice.subscription?.id) return invoice.subscription.id;
  if (typeof invoice.parent?.subscription_details?.subscription === "string") {
    return invoice.parent.subscription_details.subscription;
  }
  return "";
}

function customerIdFromStripeObject(object) {
  if (typeof object.customer === "string") return object.customer;
  if (object.customer?.id) return object.customer.id;
  return "";
}

async function stripeEventAlreadyProcessed(eventId) {
  const { data } = await supabaseAdmin
    .from("stripe_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return Boolean(data);
}

async function recordStripeEvent(event, { userId = null, creditsGranted = null, amountTotal = null, currency = null } = {}) {
  const { error } = await supabaseAdmin.from("stripe_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    user_id: userId,
    credits_granted: creditsGranted,
    amount_total_cents: amountTotal,
    currency,
    payload: event,
  });
  if (error) throw new Error(`Could not record Stripe event: ${error.message}`);
}

async function updateSubscriptionProfile({
  userId,
  planId,
  status,
  customerId,
  subscriptionId,
  currentPeriodEnd,
}) {
  if (!userId) return;
  const normalizedStatus = status || "active";
  const nextPlan = normalizedStatus === "active" || normalizedStatus === "trialing" || normalizedStatus === "past_due"
    ? planId || "free"
    : "free";
  const effectivePlan = SUBSCRIPTION_PLANS[nextPlan];
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: nextPlan,
      subscription_status: normalizedStatus,
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId || null,
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      monthly_ask_limit: effectivePlan?.monthly_credits || 10,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(`Could not update subscription profile: ${error.message}`);
}

async function resolveSubscriptionContext({ subscriptionId, customerId, priceId }) {
  let subscription = null;
  if (subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }
  const firstItem = subscription?.items?.data?.[0];
  const resolvedPriceId = priceId || firstItem?.price?.id || "";
  const planId = subscription?.metadata?.plan_id || planIdFromPriceId(resolvedPriceId);
  const userId = subscription?.metadata?.user_id || "";
  return {
    subscription,
    userId,
    planId,
    customerId: customerId || customerIdFromStripeObject(subscription || {}),
    subscriptionId: subscription?.id || subscriptionId,
    status: subscription?.status || "",
    currentPeriodEnd: subscription?.current_period_end || null,
  };
}

async function listAdminEvents(request) {
  const auth = await ensureAdminUser(request);
  if (auth.error) return auth;
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const status = url.searchParams.get("status") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 250);
  let query = supabaseAdmin
    .from("market_event_candidates")
    .select("*")
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    return { error: { status: 500, message: `Could not list market event candidates: ${error.message}` } };
  }
  return { events: data || [] };
}

async function updateAdminEventReview(request, candidateId) {
  const auth = await ensureAdminUser(request);
  if (auth.error) return auth;
  const body = JSON.parse(await readBody(request));
  const nextStatus = String(body.status || "").trim();
  const reviewNotes = String(body.review_notes || body.notes || "").trim();
  const allowed = new Set(["auto_ingested", "needs_review", "approved", "rejected", "promotion_ready", "promoted"]);
  if (!allowed.has(nextStatus)) {
    return { error: { status: 400, message: "Invalid review status." } };
  }
  const { data: existing, error: readError } = await supabaseAdmin
    .from("market_event_candidates")
    .select("candidate_id,status")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (readError) {
    return { error: { status: 500, message: `Could not read candidate: ${readError.message}` } };
  }
  if (!existing) {
    return { error: { status: 404, message: "Market event candidate was not found." } };
  }
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("market_event_candidates")
    .update({
      status: nextStatus,
      reviewed_by: auth.user.user_id,
      reviewed_at: now,
      review_notes: reviewNotes || null,
      updated_at: now,
    })
    .eq("candidate_id", candidateId)
    .select("*")
    .single();
  if (error) {
    return { error: { status: 500, message: `Could not update candidate: ${error.message}` } };
  }
  const { error: reviewError } = await supabaseAdmin.from("market_event_reviews").insert({
    candidate_id: candidateId,
    reviewer_user_id: auth.user.user_id,
    reviewer_email: auth.user.email || null,
    previous_status: existing.status,
    next_status: nextStatus,
    review_notes: reviewNotes || null,
  });
  if (reviewError) {
    return { error: { status: 500, message: `Could not record review: ${reviewError.message}` } };
  }
  return { event: data };
}

async function markAdminEventPromotionReady(request, candidateId) {
  const auth = await ensureAdminUser(request);
  if (auth.error) return auth;
  const { data: candidate, error } = await supabaseAdmin
    .from("market_event_candidates")
    .select("*")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) {
    return { error: { status: 500, message: `Could not read candidate: ${error.message}` } };
  }
  if (!candidate) {
    return { error: { status: 404, message: "Market event candidate was not found." } };
  }
  const now = new Date().toISOString();
  const { data, error: updateError } = await supabaseAdmin
    .from("market_event_candidates")
    .update({
      status: "promotion_ready",
      reviewed_by: auth.user.user_id,
      reviewed_at: now,
      review_notes: "Marked ready for CSV promotion from admin review.",
      updated_at: now,
    })
    .eq("candidate_id", candidateId)
    .select("*")
    .single();
  if (updateError) {
    return { error: { status: 500, message: `Could not mark candidate ready: ${updateError.message}` } };
  }
  await supabaseAdmin.from("market_event_reviews").insert({
    candidate_id: candidateId,
    reviewer_user_id: auth.user.user_id,
    reviewer_email: auth.user.email || null,
    previous_status: candidate.status,
    next_status: "promotion_ready",
    review_notes: "Ready for CSV promotion.",
  });
  return {
    event: data,
    promotion_hint:
      "Export promotion_ready candidates, validate them against funding_events_raw.csv, then rebuild graph artifacts.",
  };
}

async function handleStripeWebhook(request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return { error: { status: 503, message: "Stripe webhook is not configured." } };
  }
  if (!supabaseAdmin) {
    return { error: { status: 503, message: "Supabase backend credentials are not configured." } };
  }
  const rawBody = await readBody(request);
  const signature = request.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return { error: { status: 400, message: error instanceof Error ? error.message : "Invalid Stripe webhook." } };
  }

  if (await stripeEventAlreadyProcessed(event.id)) {
    return { ok: true, duplicate: true };
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id || session.client_reference_id;
      const planId = session.metadata?.plan_id || "";
      const customerId = customerIdFromStripeObject(session);
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id || "";
      const context = await resolveSubscriptionContext({ subscriptionId, customerId });
      await updateSubscriptionProfile({
        userId,
        planId: context.planId || planId,
        status: context.status || "active",
        customerId,
        subscriptionId,
        currentPeriodEnd: context.currentPeriodEnd,
      });
      await recordStripeEvent(event, {
        userId,
        amountTotal: session.amount_total,
        currency: session.currency,
      });
      return { ok: true };
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      const customerId = customerIdFromStripeObject(invoice);
      const priceId = invoice.lines?.data?.[0]?.price?.id || "";
      const context = await resolveSubscriptionContext({ subscriptionId, customerId, priceId });
      const plan = SUBSCRIPTION_PLANS[context.planId];
      if (!context.userId || !plan) {
        await recordStripeEvent(event, {
          amountTotal: invoice.amount_paid,
          currency: invoice.currency,
        });
        return { ok: true, ignored: true };
      }
      await updateSubscriptionProfile({
        userId: context.userId,
        planId: context.planId,
        status: context.status || "active",
        customerId: context.customerId,
        subscriptionId: context.subscriptionId,
        currentPeriodEnd: context.currentPeriodEnd,
      });
      const { error: grantError } = await supabaseAdmin.rpc("grant_ask_credits", {
        target_user_id: context.userId,
        credit_amount: plan.monthly_credits,
        grant_reason: "stripe_purchase",
        stripe_event_id: event.id,
        grant_metadata: {
          source: "subscription_invoice",
          plan_id: context.planId,
          invoice_id: invoice.id,
          subscription_id: context.subscriptionId,
          amount_paid_cents: invoice.amount_paid,
          currency: invoice.currency,
        },
      });
      if (grantError) throw new Error(`Could not grant Ask credits: ${grantError.message}`);
      await recordStripeEvent(event, {
        userId: context.userId,
        creditsGranted: plan.monthly_credits,
        amountTotal: invoice.amount_paid,
        currency: invoice.currency,
      });
      return { ok: true };
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const priceId = subscription.items?.data?.[0]?.price?.id || "";
      const planId = subscription.metadata?.plan_id || planIdFromPriceId(priceId);
      const userId = subscription.metadata?.user_id || "";
      await updateSubscriptionProfile({
        userId,
        planId,
        status: subscription.status,
        customerId: customerIdFromStripeObject(subscription),
        subscriptionId: subscription.id,
        currentPeriodEnd: subscription.current_period_end,
      });
      await recordStripeEvent(event, { userId });
      return { ok: true };
    }

    await recordStripeEvent(event);
    return { ok: true, ignored: true };
  } catch (error) {
    return { error: { status: 500, message: error instanceof Error ? error.message : "Stripe webhook failed." } };
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "http://127.0.0.1:5173",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-ask-token, authorization",
  });
  response.end(JSON.stringify(payload));
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendStatic(request, response) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(DIST_DIR, `.${requestedPath}`);
  const safeDist = `${DIST_DIR}${DIST_DIR.endsWith("/") ? "" : "/"}`;
  const safeFile = `${filePath}${filePath.endsWith("/") ? "" : ""}`;
  const isAssetRequest = pathname.startsWith("/assets/") || pathname.startsWith("/data/");
  if (isAssetRequest && (!safeFile.startsWith(safeDist) || !existsSync(filePath))) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const targetPath = safeFile.startsWith(safeDist) && existsSync(filePath) ? filePath : join(DIST_DIR, "index.html");
  const ext = extname(targetPath);
  const body = readFileSync(targetPath);
  response.writeHead(200, {
    "content-type": MIME_TYPES[ext] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cache-control": pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : pathname.startsWith("/data/")
        ? "public, max-age=300"
        : "no-store",
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function compactNode(node) {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    region: node.region,
    country: node.country,
    domain: node.domain,
    year: node.year,
    amount_usd: node.amount_usd,
    round_type: node.round_type,
    round_date: node.round_date,
    startup_name: node.startup_name,
    investor_type: node.investor_type,
    participated_rounds: node.participated_rounds,
    mega_round_count: node.mega_round_count,
    profile_confidence: node.profile_confidence,
    notable_products: node.notable_products,
    trajectory_label: node.trajectory_label,
    funding_usd: node.visible_mega_round_funding_usd || node.linked_funding_usd || node.funding_usd,
    confidence: node.confidence,
    source_type: node.source_type,
    source_url: node.source_url,
  };
}

function compactEdge(edge, nodeById = new Map()) {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  return {
    source: edge.source,
    source_label: source?.label,
    source_kind: source?.kind,
    target: edge.target,
    target_label: target?.label,
    target_kind: target?.kind,
    kind: edge.kind,
    role: edge.role,
    amount_usd: edge.amount_usd,
  };
}

function summarizeContext(selected, nodes, edges) {
  const rounds = nodes.filter((node) => node.kind === "round");
  const investors = nodes.filter((node) => node.kind === "investor");
  const startups = nodes.filter((node) => node.kind === "startup");
  const countries = [...new Set(startups.map((node) => node.country).filter(Boolean))];
  const domains = [...new Set(startups.map((node) => node.domain).filter(Boolean))];
  const visibleFunding = rounds.reduce((sum, node) => sum + Number(node.amount_usd || 0), 0);
  const topRounds = rounds
    .slice()
    .sort((left, right) => Number(right.amount_usd || 0) - Number(left.amount_usd || 0))
    .slice(0, 8)
    .map((round) => ({
      label: round.label,
      amount_usd: round.amount_usd,
      year: round.year,
      confidence: round.confidence,
      source_url: round.source_url,
    }));

  return {
    selected,
    visible_counts: {
      nodes: nodes.length,
      edges: edges.length,
      startups: startups.length,
      rounds: rounds.length,
      investors: investors.length,
    },
    visible_funding_usd: visibleFunding,
    countries,
    domains,
    top_rounds: topRounds,
  };
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, {});
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "ai-market-graph",
      timestamp: new Date().toISOString(),
      config: configStatus(),
    });
    return;
  }

  if (request.method === "GET" && request.url === "/api/ask/usage") {
    const auth = await ensureUser(request);
    if (auth.error) {
      sendJson(response, auth.error.status, { error: auth.error.message });
      return;
    }
    sendJson(response, 200, { usage: publicUsage(auth.user) });
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/api/admin/events")) {
    const result = await listAdminEvents(request);
    if (result.error) {
      sendJson(response, result.error.status, { error: result.error.message });
      return;
    }
    sendJson(response, 200, { events: result.events });
    return;
  }

  const reviewMatch = request.url?.match(/^\/api\/admin\/events\/([^/]+)\/review$/);
  if (request.method === "POST" && reviewMatch) {
    try {
      const result = await updateAdminEventReview(request, decodeURIComponent(reviewMatch[1]));
      if (result.error) {
        sendJson(response, result.error.status, { error: result.error.message });
        return;
      }
      sendJson(response, 200, { event: result.event });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Admin review failed." });
    }
    return;
  }

  const promoteMatch = request.url?.match(/^\/api\/admin\/events\/([^/]+)\/promote$/);
  if (request.method === "POST" && promoteMatch) {
    try {
      const result = await markAdminEventPromotionReady(request, decodeURIComponent(promoteMatch[1]));
      if (result.error) {
        sendJson(response, result.error.status, { error: result.error.message });
        return;
      }
      sendJson(response, 200, { event: result.event, promotion_hint: result.promotion_hint });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Admin promotion failed." });
    }
    return;
  }

  if (request.method === "GET" && (request.url === "/api/subscription-plans" || request.url === "/api/credit-packs")) {
    sendJson(response, 200, {
      plans: Object.fromEntries(
        Object.entries(SUBSCRIPTION_PLANS).map(([planId, plan]) => [
          planId,
          {
            label: plan.label,
            amount_cents: plan.amount_cents,
            currency: plan.currency,
            monthly_credits: plan.monthly_credits,
          },
        ]),
      ),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/checkout") {
    try {
      const result = await createCheckoutSession(request);
      if (result.error) {
        sendJson(response, result.error.status, { error: result.error.message });
        return;
      }
      sendJson(response, 200, { url: result.session.url });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Checkout failed." });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/billing-portal") {
    try {
      const result = await createBillingPortalSession(request);
      if (result.error) {
        sendJson(response, result.error.status, { error: result.error.message });
        return;
      }
      sendJson(response, 200, { url: result.session.url });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Billing portal failed." });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/stripe/webhook") {
    const result = await handleStripeWebhook(request);
    if (result.error) {
      sendJson(response, result.error.status, { error: result.error.message });
      return;
    }
    sendJson(response, 200, result);
    return;
  }

  if (request.url?.startsWith("/api/") && (request.method !== "POST" || request.url !== "/api/ask")) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  if (!request.url?.startsWith("/api/")) {
    try {
      sendStatic(request, response);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Static file error." });
    }
    return;
  }

  if (!process.env.NEBIUS_API_KEY) {
    sendJson(response, 503, {
      error: "NEBIUS_API_KEY is not set. Start the proxy with a Nebius Token Factory API key.",
    });
    return;
  }

  try {
    const auth = await ensureUser(request);
    if (auth.error) {
      sendJson(response, auth.error.status, { error: auth.error.message });
      return;
    }
    const preflightError = checkCreditsAndRateLimit(auth.user, auth.provider);
    if (preflightError) {
      sendJson(response, preflightError.status, { error: preflightError.message, usage: publicUsage(auth.user) });
      return;
    }

    const payload = JSON.parse(await readBody(request));
    const selected = compactNode(payload.selected || {});
    const nodes = (payload.neighborhood?.nodes || []).slice(0, 80).map(compactNode);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = (payload.neighborhood?.edges || []).slice(0, 140).map((edge) => compactEdge(edge, nodeById));
    const history = Array.isArray(payload.messages)
      ? payload.messages
          .slice(-8)
          .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
          .map((message) => ({ role: message.role, content: message.content.slice(0, 1600) }))
      : [];

    const system = [
      "You are a clear, conversational AI market analyst inside an interactive knowledge-graph app.",
      "The user may ask about the selected graph entity, the visible graph neighborhood, or general AI/startup/market concepts.",
      "When the answer depends on graph data, ground it in the supplied graph context and say when the context is incomplete.",
      "For general explanatory questions, you may use general knowledge, but clearly separate it from graph evidence with wording like 'In general' or 'Outside the graph context'.",
      "Never invent graph facts such as valuations, revenue, investors, dates, or funding history. If a value is not in the graph context, say it is not shown in the graph context.",
      "Do not infer facts from URL slugs or article titles unless the same fact appears in a provided field.",
      "When discussing a specific funding event, include the source URL if it is available in the context, but do not over-format the answer.",
      "Be investor-useful without giving buy/sell advice or personalized financial recommendations.",
      "Prefer concise answers: 1-3 short paragraphs for simple questions, or a compact bullet list when comparing entities.",
      "If the user asks a vague question like 'tell me about this series', explain the selected round from the graph first, then note what is not shown.",
    ].join(" ");

    const summary = summarizeContext(selected, nodes, edges);
    const context = JSON.stringify({ summary, selected, nodes, edges }, null, 2);
    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          "Current graph context JSON:",
          context,
          "",
          "Use this graph context as the evidence base for graph-specific claims.",
          "If the user asks a broader question, answer generally but label it as general context rather than graph evidence.",
        ].join("\n"),
      },
      ...history,
      { role: "user", content: String(payload.question || "") },
    ];

    const nebiusResponse = await fetch(`${BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.NEBIUS_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.35,
        max_tokens: 1600,
        reasoning_effort: "low",
        messages,
      }),
    });

    const data = await nebiusResponse.json();
    if (!nebiusResponse.ok) {
      sendJson(response, nebiusResponse.status, {
        error: data.error?.message || data.message || `Nebius request failed with HTTP ${nebiusResponse.status}.`,
      });
      return;
    }

    const choice = data.choices?.[0] || {};
    const answer = choice.message?.content || choice.text;
    const usage = data.usage || {};
    if (auth.provider === "supabase") {
      await consumeSupabaseCredits(auth.user, selected, String(payload.question || ""), usage);
    } else {
      chargeUser(auth.user, usage);
      saveLedger(auth.ledger);
      appendJsonLine(ASK_USAGE_LOG_FILE, {
        timestamp: new Date().toISOString(),
        user_id: auth.user.user_id,
        model: MODEL,
        credits_charged: ASK_CREDITS_PER_PROMPT,
        credits_remaining: auth.user.credits_remaining,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        status: "ok",
      });
    }
    sendJson(response, 200, {
      answer:
        typeof answer === "string" && answer.trim()
          ? answer.trim()
          : "The model returned reasoning tokens but no final answer. Try asking a shorter question or use a non-reasoning model.",
      model: MODEL,
      usage: publicUsage(auth.user),
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Graph assistant failed.",
    });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`AI Market Graph server listening on http://0.0.0.0:${PORT}`);
});

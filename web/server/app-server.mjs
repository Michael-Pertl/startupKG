import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mergeMarketEventRows } from "./market-event-merge.mjs";
import { canonicalContext } from "./canonical-context.mjs";

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
const MODEL = process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.6";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://127.0.0.1:5173";
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const MARKET_EVENT_CORE_TYPES = new Set([
  "funding_round",
  "strategic_investment",
  "compute_commitment",
  "ipo_filing",
  "ipo_pricing",
  "public_listing",
]);
const MARKET_EVENT_BROAD_TYPES = new Set([
  "ipo_watch",
  "valuation_update",
  "major_partnership",
  "acquisition_or_merger",
  "revenue_or_usage_milestone",
]);
const MARKET_EVENT_VISIBLE_STATUS = new Set(["approved", "needs_review", "auto_ingested"]);
const MARKET_EVENT_MIN_FUNDING_USD = 100_000_000;
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// One shared snapshot serves browser graph/analytics and server-side Ask evidence.
let publishedSnapshot = null;
let snapshotCheckedAt = 0;
let snapshotRequest = null;
async function publishedAssets() {
  if (!supabaseAdmin) return null;
  if (Date.now() - snapshotCheckedAt < 60000) return publishedSnapshot;
  if (!snapshotRequest) {
    snapshotRequest = (async () => {
      try {
        const { data, error } = await supabaseAdmin.from("platform_snapshots")
          .select("payload").eq("id", "current").maybeSingle().abortSignal(AbortSignal.timeout(5000));
        const assets = data?.payload?.assets;
        if (!error && Array.isArray(assets?.["market_graph.json"]?.nodes)
            && Array.isArray(assets?.["market_graph.json"]?.edges)) publishedSnapshot = assets;
      } catch { /* Keep the last known good snapshot, or bundled data on first boot. */ }
      snapshotCheckedAt = Date.now();
      return publishedSnapshot;
    })().finally(() => { snapshotRequest = null; });
  }
  return snapshotRequest;
}
async function publishedGraph() {
  return (await publishedAssets())?.["market_graph.json"]
    || readJsonFile(resolve(DIST_DIR, "data", "market_graph.json"), null);
}

function configStatus() {
  return {
    nebius_configured: Boolean(process.env.NEBIUS_API_KEY),
    nebius_model: MODEL,
    nebius_base_url: BASE_URL,
    supabase_configured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    admin_review_configured: ADMIN_EMAILS.size > 0,
    app_public_url: APP_PUBLIC_URL,
    static_dir: DIST_DIR,
  };
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function tokenFromRequest(request) {
  const header = request.headers["x-ask-token"] || request.headers.authorization || "";
  return (Array.isArray(header) ? header[0] : header).replace(/^Bearer\s+/i, "").trim();
}

async function ensureSupabaseUser(request) {
  if (!supabaseAdmin) return { error: { status: 503, message: "Optional admin backend is not configured." } };
  const { data, error } = await supabaseAdmin.auth.getUser(tokenFromRequest(request));
  if (error || !data?.user) return { error: { status: 401, message: "Valid admin login required." } };
  return { user: { user_id: data.user.id, email: data.user.email } };
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

async function adminStatus(request) {
  const auth = await ensureSupabaseUser(request);
  if (auth.error) return auth;
  const email = String(auth.user.email || "").toLowerCase();
  return {
    admin: Boolean(ADMIN_EMAILS.size && ADMIN_EMAILS.has(email)),
    email: auth.user.email || "",
  };
}

function ipoStageForEventType(eventType) {
  return {
    ipo_watch: "watch",
    ipo_filing: "filing",
    ipo_pricing: "pricing",
    public_listing: "listed",
  }[eventType] || "";
}

function marketEventSignal(row) {
  const eventType = row.event_type || "";
  const status = row.status || "";
  const amountUsd = Number(row.amount_usd || 0);
  if (status !== "approved") return ["review_queue", "Unreviewed discovery item"];
  if (
    status === "approved" &&
    MARKET_EVENT_CORE_TYPES.has(eventType) &&
    (eventType !== "funding_round" || amountUsd >= MARKET_EVENT_MIN_FUNDING_USD)
  ) {
    return ["core_signal", "Reviewed core signal"];
  }
  if (MARKET_EVENT_BROAD_TYPES.has(eventType)) {
    return ["watchlist_signal", "Broader investor watchlist signal"];
  }
  if (eventType === "funding_round" && amountUsd > 0 && amountUsd < MARKET_EVENT_MIN_FUNDING_USD) {
    return ["watchlist_signal", "Below-threshold funding signal"];
  }
  if (["auto_ingested", "needs_review", "staged"].includes(status)) {
    return ["review_queue", "Unreviewed discovery item"];
  }
  return ["watchlist_signal", "Broader investor watchlist signal"];
}

function marketEventPayload(rows, source = "supabase") {
  const events = rows
    .filter((row) => MARKET_EVENT_VISIBLE_STATUS.has(row.status || ""))
    .map((row) => {
      const [signalTier, signalLabel] = marketEventSignal(row);
      return {
        event_id: row.event_id || row.candidate_id,
        company_name: row.company_name || "",
        event_type: row.event_type || "",
        ipo_stage: row.ipo_stage || ipoStageForEventType(row.event_type),
        event_date: row.event_date || "",
        year: String(row.year || (row.event_date || "").slice(0, 4)),
        country: row.country || "",
        region: row.region || "",
        amount_usd: row.amount_usd === null || row.amount_usd === undefined ? null : Number(row.amount_usd),
        valuation_usd: row.valuation_usd === null || row.valuation_usd === undefined ? null : Number(row.valuation_usd),
        source_url: row.source_url || "",
        source_type: row.source_type || "",
        confidence: row.confidence || "",
        status: row.status || "",
        signal_tier: signalTier,
        signal_label: signalLabel,
        linked_startup_id: row.linked_startup_id || "",
        linked_startup_label: row.linked_startup_label || "",
        summary: row.summary || "",
        notes: row.notes || "",
      };
    })
    .sort((left, right) => String(right.event_date || "").localeCompare(String(left.event_date || "")));
  return {
    metadata: {
      title: "AI Market Event Monitor",
      event_count: events.length,
      source,
      generated_at: new Date().toISOString(),
      scope_note:
        "Curated public monitoring events for AI market intelligence. These are public source alerts and not investment recommendations.",
    },
    facets: {
      event_types: [...new Set(events.map((event) => event.event_type).filter(Boolean))].sort(),
      ipo_stages: [...new Set(events.map((event) => event.ipo_stage).filter(Boolean))].sort(),
      regions: [...new Set(events.map((event) => event.region).filter(Boolean))].sort(),
      confidence: [...new Set(events.map((event) => event.confidence).filter(Boolean))].sort(),
      statuses: [...new Set(events.map((event) => event.status).filter(Boolean))].sort(),
      signal_tiers: [...new Set(events.map((event) => event.signal_tier).filter(Boolean))].sort(),
    },
    events,
  };
}

async function publicMarketEvents() {
  const liveFeed = (await publishedAssets())?.["market_events.json"];
  if (liveFeed) return liveFeed;
  const fallback = readJsonFile(resolve(DIST_DIR, "data", "market_events.json"), null);
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("market_event_candidates")
      .select("*")
      .in("status", [...MARKET_EVENT_VISIBLE_STATUS, "rejected", "staged"])
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data?.length) return marketEventPayload(mergeMarketEventRows(fallback?.events || [], data), "curated_and_supabase");
    if (!error) {
      console.warn("Supabase market events are empty; falling back to static JSON.");
    } else {
      console.warn(`Could not read Supabase market events; falling back to static JSON: ${error.message}`);
    }
  }
  if (fallback) return { ...fallback, metadata: { ...fallback.metadata, source: "static_json" } };
  return marketEventPayload([], "empty");
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
  const allowed = new Set(["auto_ingested", "needs_review", "staged", "approved", "rejected", "promotion_ready", "promoted"]);
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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
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
    event_id: node.event_id,
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
    amount_basis: node.amount_basis,
    source_checked_at: node.source_checked_at,
    verification_status: node.verification_status,
    evidence_notes: node.evidence_notes,
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

const server = createServer(async (request, response) => {
  const assetName = new URL(request.url || "/", "http://localhost").pathname.match(/^\/data\/(market_graph\.json|data_health\.json|market_events\.json)$/)?.[1];
  if (request.method === "GET" && assetName) {
    const asset = (await publishedAssets())?.[assetName];
    if (asset) { sendJson(response, 200, asset); return; }
  }

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

  if (request.method === "GET" && request.url?.startsWith("/api/market-events")) {
    try {
      sendJson(response, 200, await publicMarketEvents());
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Could not load market events." });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/admin/me") {
    const result = await adminStatus(request);
    if (result.error) {
      sendJson(response, result.error.status, { error: result.error.message, admin: false });
      return;
    }
    sendJson(response, 200, { admin: result.admin, email: result.email });
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
    const payload = JSON.parse(await readBody(request));
    const graph = await publishedGraph();
    if (!graph) {
      sendJson(response, 503, { error: "Published graph evidence is unavailable." });
      return;
    }
    const canonical = canonicalContext(graph, payload);
    const selected = compactNode(canonical.selected);
    const nodes = canonical.nodes.map(compactNode);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = canonical.edges.map((edge) => compactEdge(edge, nodeById));
    const history = Array.isArray(payload.messages)
      ? payload.messages
          .slice(-8)
          .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
          .map((message) => ({ role: message.role, content: message.content.slice(0, 1600) }))
      : [];

    const system = [
      "You are a clear, conversational AI market analyst inside an interactive knowledge-graph app.",
      "The user may ask about the selected graph entity, the visible graph neighborhood, or general AI/startup/market concepts.",
      "For cross-company questions, use the retrieved funding paths even when those entities are outside the visible view. Explain the path: company to funding event to shared investor to other company funding event. Cite the relevant round source URLs. Distinguish missing portfolio evidence from evidence that an investor has no other investments. Disclose retrieval truncation. Never treat graph centrality or linked round size as a cheque size.",
      "A shared investor is an observed connection, not evidence of an existing partnership or a higher partnership probability. Offer possible partnerships only as explicitly labeled hypotheses based on documented company domains or products. Explain the operational fit and what independent commercial evidence would be needed. Do not assign probability scores, claim investor introductions, or assert contracts from investment paths alone.",
      "When the answer depends on graph data, ground it in the supplied graph context and say when the context is incomplete.",
      "For general explanatory questions, you may use general knowledge, but clearly separate it from graph evidence with wording like 'In general' or 'Outside the graph context'.",
      "Conversation history is dialogue, not independent evidence. Only the current server-supplied evidence supports graph facts. In current-view scope, do not reuse facts from an earlier broader search unless the current context includes them.",
      "Never invent graph facts such as valuations, revenue, investors, dates, or funding history. If a value is not in the graph context, say it is not shown in the graph context.",
      "Reported amounts are not necessarily cash disbursed. Preserve amount_basis distinctions for committed capital, prior commitments, debt and lower bounds. Missing source rechecks mean accuracy has not been independently re-established.",
      "Use the dataset scope and latest evidence date when answering current-landscape questions. Export time is not a coverage cutoff; do not claim exhaustive or real-time market coverage.",
      "Do not infer facts from URL slugs or article titles unless the same fact appears in a provided field.",
      "When discussing a specific funding event, include the source URL if it is available in the context, but do not over-format the answer.",
      "Be investor-useful without giving buy/sell advice or personalized financial recommendations.",
      "Prefer concise answers: 1-3 short paragraphs for simple questions, or a compact bullet list when comparing entities.",
      "If the user asks a vague question like 'tell me about this series', explain the selected round from the graph first, then note what is not shown.",
    ].join(" ");

    const summary = summarizeContext(selected, nodes, edges);
    const context = JSON.stringify({ summary, selected, nodes, edges, funding_paths: canonical.paths, retrieval: canonical.retrieval, evidence: canonical.evidence }, null, 2);
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
        ...(process.env.NEBIUS_REASONING_EFFORT ? { reasoning_effort: process.env.NEBIUS_REASONING_EFFORT } : {}),
        messages,
      }),
    });

    const data = await nebiusResponse.json();
    if (!nebiusResponse.ok) {
      sendJson(response, nebiusResponse.status, {
        error: [
          `Nebius request failed with HTTP ${nebiusResponse.status} (model: ${MODEL}; endpoint: ${BASE_URL}).`,
          typeof data.detail === "string" ? data.detail : data.error?.message || data.message || "",
          nebiusResponse.status === 404
            ? "Check NEBIUS_MODEL against GET /v1/models and set NEBIUS_BASE_URL to the correct API base URL."
            : nebiusResponse.status === 401
              ? "Check the server-side NEBIUS_API_KEY; the provider rejected authentication."
              : "",
        ].filter(Boolean).join(" "),
      });
      return;
    }

    const choice = data.choices?.[0] || {};
    const answer = choice.message?.content || choice.text;
    sendJson(response, 200, {
      answer:
        typeof answer === "string" && answer.trim()
          ? answer.trim()
          : "The model returned reasoning tokens but no final answer. Try asking a shorter question or use a non-reasoning model.",
      model: MODEL,
      context: canonical.retrieval,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Graph assistant failed.",
    });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`AI Market Graph server listening on http://0.0.0.0:${server.address().port}`);
});

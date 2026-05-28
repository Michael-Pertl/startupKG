import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const checks = [];

function requireEnv(name, reason) {
  checks.push({
    name,
    required: true,
    ok: Boolean(process.env[name]),
    reason,
  });
}

function recommendEnv(name, reason) {
  checks.push({
    name,
    required: false,
    ok: Boolean(process.env[name]),
    reason,
  });
}

const authProvider = process.env.ASK_AUTH_PROVIDER || "local";
const requireAskAuth = (process.env.ASK_REQUIRE_AUTH || "false").toLowerCase() === "true";

requireEnv("NEBIUS_API_KEY", "Server-side model calls for the Ask panel.");
requireEnv("APP_PUBLIC_URL", "Stripe redirects and production canonical URL.");

if (authProvider !== "supabase") {
  checks.push({
    name: "ASK_AUTH_PROVIDER",
    required: true,
    ok: false,
    reason: "Set ASK_AUTH_PROVIDER=supabase before a public launch.",
  });
}

if (!requireAskAuth) {
  checks.push({
    name: "ASK_REQUIRE_AUTH",
    required: true,
    ok: false,
    reason: "Set ASK_REQUIRE_AUTH=true so Ask is gated by login/credits.",
  });
}

requireEnv("SUPABASE_URL", "Server-side Supabase project URL.");
requireEnv("SUPABASE_SERVICE_ROLE_KEY", "Server-side Supabase admin key for credit RPCs.");
requireEnv("VITE_SUPABASE_URL", "Frontend Supabase login client.");
requireEnv("VITE_SUPABASE_ANON_KEY", "Frontend Supabase anonymous key.");

requireEnv("STRIPE_SECRET_KEY", "Server-side Stripe Checkout.");
requireEnv("STRIPE_WEBHOOK_SECRET", "Stripe webhook signature verification.");
recommendEnv("ASK_CREDITS_PER_PROMPT", "Controls how many credits each successful Ask response deducts.");
recommendEnv("ASK_MAX_REQUESTS_PER_MINUTE", "Protects the Ask endpoint from excessive use.");

const failures = checks.filter((check) => check.required && !check.ok);
const warnings = checks.filter((check) => !check.required && !check.ok);

for (const check of checks) {
  const marker = check.ok ? "OK" : check.required ? "MISSING" : "OPTIONAL";
  console.log(`${marker} ${check.name} - ${check.reason}`);
}

if (warnings.length) {
  console.log(`\nOptional settings not configured: ${warnings.map((check) => check.name).join(", ")}`);
}

if (failures.length) {
  console.error(`\nProduction env check failed: ${failures.length} required setting(s) missing or unsafe.`);
  process.exit(1);
}

console.log("\nProduction env check passed.");

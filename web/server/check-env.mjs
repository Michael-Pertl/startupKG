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
    ok: Boolean(process.env[name]) && !/replace_with|your-project|your-server/i.test(process.env[name]),
    reason,
  });
}

function recommendEnv(name, reason) {
  checks.push({
    name,
    required: false,
    ok: Boolean(process.env[name]) && !/replace_with|your-project|your-server/i.test(process.env[name]),
    reason,
  });
}

requireEnv("NEBIUS_API_KEY", "Server-side Nebius model calls for the hackathon Ask panel.");
recommendEnv("NEBIUS_MODEL", "Defaults to moonshotai/Kimi-K2.6.");
if (process.env.ADMIN_EMAILS) {
  requireEnv("SUPABASE_URL", "Optional authenticated administrator review.");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", "Optional administrator review storage.");
}

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

// Read-only provider check: no inference requests or token charges.
if (process.argv.includes("--check-models")) {
  const base = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, "");
  const model = process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.6";
  try {
    const response = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${process.env.NEBIUS_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Model catalog returned HTTP ${response.status}. Check NEBIUS_API_KEY and NEBIUS_BASE_URL.`);
    const data = await response.json();
    const ids = (data.data || []).map((item) => item.id);
    if (!ids.includes(model)) {
      console.error(`Configured model ${model} is unavailable at ${base}. Available model IDs:`);
      console.error(ids.join("\n"));
      process.exit(1);
    }
    console.log(`Provider check passed: ${model} is listed at ${base}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Model catalog check failed.");
    process.exit(1);
  }
}

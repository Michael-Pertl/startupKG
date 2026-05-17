import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.GRAPH_ASSISTANT_PORT || 8787);
const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/";
const MODEL = process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.5";

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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "http://127.0.0.1:5173",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
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
    funding_usd: node.visible_mega_round_funding_usd || node.linked_funding_usd || node.funding_usd,
    confidence: node.confidence,
    source_url: node.source_url,
  };
}

function compactEdge(edge) {
  return {
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
    role: edge.role,
    amount_usd: edge.amount_usd,
  };
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, {});
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/ask") {
    sendJson(response, 404, { error: "Not found." });
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
    const selected = compactNode(payload.selected || {});
    const nodes = (payload.neighborhood?.nodes || []).slice(0, 80).map(compactNode);
    const edges = (payload.neighborhood?.edges || []).slice(0, 140).map(compactEdge);

    const system = [
      "You analyze a supplied knowledge-graph neighborhood for AI private-market funding.",
      "Use only the JSON graph context in the user message. Do not use outside knowledge.",
      "If the graph context does not contain enough evidence, say exactly what is missing.",
      "Never invent valuations, revenue, investors, dates, or funding history.",
      "When discussing a funding event, cite the source_url from the relevant round node.",
      "Separate observed graph facts from cautious interpretation.",
      "Keep the answer concise and decision-useful.",
    ].join(" ");

    const context = JSON.stringify({ selected, nodes, edges }, null, 2);
    const nebiusResponse = await fetch(`${BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.NEBIUS_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 1600,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              `Question: ${payload.question}`,
              "",
              "Graph context JSON:",
              context,
              "",
              "Answer format:",
              "- Direct answer",
              "- Evidence from graph",
              "- Missing context / caveats",
            ].join("\n"),
          },
        ],
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
    sendJson(response, 200, {
      answer:
        typeof answer === "string" && answer.trim()
          ? answer.trim()
          : "The model returned reasoning tokens but no final answer. Try asking a shorter question or use a non-reasoning model.",
      model: MODEL,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Graph assistant failed.",
    });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Graph assistant proxy listening on http://127.0.0.1:${PORT}`);
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

// Real HTTP requests to the application, with a local model stub: no provider cost.
test('hackathon Ask is anonymous and unmetered; billing routes are removed', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'hackathon-access-'));
  await mkdir(join(directory, 'data'));
  await writeFile(join(directory, 'data/market_graph.json'), JSON.stringify({
    nodes: [
      { id: 'round', label: 'Example round', kind: 'round', amount_usd: 100_000_000 },
      { id: 'nebius', label: 'Nebius', kind: 'startup' },
      { id: 'other', label: 'Other company', kind: 'startup' },
      { id: 'backer', label: 'Backer', kind: 'investor' },
      { id: 'nebius-round', label: 'Nebius round', kind: 'round', confidence: 'high', source_url: 'https://example.org/nebius' },
      { id: 'other-round', label: 'Other round', kind: 'round', confidence: 'high', source_url: 'https://example.org/other' },
    ], edges: [
      { source: 'nebius', target: 'nebius-round', kind: 'raised' },
      { source: 'other', target: 'other-round', kind: 'raised' },
      { source: 'backer', target: 'nebius-round', kind: 'participated' },
      { source: 'backer', target: 'other-round', kind: 'participated' },
    ],
  }));
  let calls = 0;
  let providerStatus = 200;
  const model = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.match(payload.messages[1].content, /100000000/);
    assert.equal(payload.model, "nvidia/test-nemotron");
    assert.equal(payload.reasoning_effort, undefined);
    if (payload.messages.at(-1).content === 'Who backs Nebius and what else have they funded?') {
      const context = JSON.parse(payload.messages[1].content.split('\n\n')[0].replace(/^Current graph context JSON:\n/, ''));
      if (context.retrieval.scope === 'graph') {
        assert(context.funding_paths.some(path => path.company_id === 'other'));
        assert.equal(context.nodes.find(node => node.id === 'other-round').source_url, 'https://example.org/other');
      } else assert.equal(context.funding_paths.length, 0);
      assert.match(payload.messages[0].content, /not evidence of an existing partnership/);
    }
    calls++;
    response.writeHead(providerStatus, { 'content-type': 'application/json' });
    if (providerStatus !== 200) {
      response.end(JSON.stringify({ detail: 'Requested model is unavailable' }));
      return;
    }
    response.end(JSON.stringify({ choices: [{ message: { content: 'Source-grounded demo answer.' } }] }));
  });
  model.listen(0, '127.0.0.1');
  await once(model, 'listening');
  const child = spawn(process.execPath, ['server/app-server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', STATIC_DIR: directory, NEBIUS_API_KEY: 'test-only', NEBIUS_MODEL: 'nvidia/test-nemotron', NEBIUS_REASONING_EFFORT: '',
      NEBIUS_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
      SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', ADMIN_EMAILS: '',
      // Old deployment settings cannot reinstate a paywall.
      ASK_REQUIRE_AUTH: 'true', ASK_AUTH_PROVIDER: 'supabase', ASK_CREDITS_PER_PROMPT: '999',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    await once(child, 'exit');
    model.close();
    await rm(directory, { recursive: true, force: true });
  });
  // The app prints its actual bound port, including when PORT=0.
  const address = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Application startup timed out')), 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.once('error', reject);
  });
  for (let i = 0; i < 10; i++) {
    const response = await fetch(`${address}/api/ask`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selected: { id: 'round', amount_usd: 999 }, question: 'Explain this round.' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.answer, 'Source-grounded demo answer.');
    assert.equal(result.usage, undefined);
  }
  assert.equal(calls, 10);
  for (const scope of ['graph', 'visible']) {
    const response = await fetch(`${address}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope, selected: { id: 'round' }, question: 'Who backs Nebius and what else have they funded?' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).context.scope, scope);
  }
  providerStatus = 404;
  const failure = await fetch(`${address}/api/ask`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selected: { id: 'round' }, question: 'Explain this round.' }),
  });
  assert.equal(failure.status, 404);
  const failureBody = await failure.json();
  assert.match(failureBody.error, /Requested model is unavailable/);
  assert.match(failureBody.error, /NEBIUS_MODEL/);
  assert.match(failureBody.error, /endpoint:/);
  for (const path of ['/api/checkout', '/api/billing-portal', '/api/stripe/webhook', '/api/subscription-plans', '/api/credit-packs', '/api/ask/usage']) {
    const response = await fetch(`${address}${path}`, { method: path.includes('plans') || path.includes('packs') || path.includes('usage') ? 'GET' : 'POST' });
    assert.equal(response.status, 404, path);
  }
  const admin = await fetch(`${address}/api/admin/events`);
  assert.notEqual(admin.status, 200);
});

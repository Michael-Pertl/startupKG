import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

test('shared graph snapshot supplies browser, News and Ask; internal evidence stays private', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'published-snapshot-'));
  await mkdir(join(directory, 'data'));
  await writeFile(join(directory, 'data/market_graph.json'), JSON.stringify({nodes: [], edges: []}));
  const graph = { metadata: {snapshot_id: 'live'}, nodes: [{id: 'live-company', kind: 'startup', label: 'Live Company'}], edges: [] };
  let reads = 0;
  const database = createServer((req, res) => {
    assert.match(req.url, /^\/rest\/v1\/platform_snapshots\?/);
    reads++;
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({payload: {assets: {'market_graph.json': graph,
      'market_events.json': {events: [{event_id: 'live-news'}]}, 'data_health.json': {generated_at: 'live'}},
      evidence: {secret: 'private-evidence'}}}));
  });
  const model = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    assert.match(payload.messages[1].content, /Live Company/);
    assert.doesNotMatch(payload.messages[1].content, /private-evidence/);
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({choices: [{message: {content: 'Live evidence answer'}}]}));
  });
  database.listen(0, '127.0.0.1'); model.listen(0, '127.0.0.1');
  await Promise.all([once(database, 'listening'), once(model, 'listening')]);
  const child = spawn(process.execPath, ['server/app-server.mjs'], {
    cwd: new URL('..', import.meta.url), env: {...process.env, PORT: '0', STATIC_DIR: directory,
      SUPABASE_URL: `http://127.0.0.1:${database.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'test-only',
      NEBIUS_API_KEY: 'test-only', NEBIUS_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill(); await once(child, 'exit');
    database.close(); model.close();
    await rm(directory, {recursive: true, force: true});
  });
  const address = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Startup timed out')), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.once('error', reject);
  });
  const live = await (await fetch(`${address}/data/market_graph.json`)).json();
  assert.equal(live.metadata.snapshot_id, 'live');
  assert.equal(live.evidence, undefined);
  assert.equal((await (await fetch(`${address}/api/market-events`)).json()).events[0].event_id, 'live-news');
  assert.equal((await (await fetch(`${address}/data/data_health.json`)).json()).generated_at, 'live');
  const answer = await fetch(`${address}/api/ask`, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({question: 'Explain Live Company', scope: 'graph', selected: {id: 'live-company'}})});
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).answer, 'Live evidence answer');
  assert.equal(reads, 1, 'All endpoints share the cached snapshot');
});

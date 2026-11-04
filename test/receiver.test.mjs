import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReceiver } from '../receiver/server.mjs';

const token = 'test-test-test-test-test-test-12345678';
async function withServer(fn) {
  const receiver = createReceiver({ token });
  const server = http.createServer(receiver.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('health reports seven agents without authentication', async () => withServer(async base => {
  const r = await fetch(base + '/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).agentCount, 7);
}));
test('events reject requests without bearer authorization', async () => withServer(async base => {
  const r = await fetch(base + '/events', { method: 'POST', body: '{}' });
  assert.equal(r.status, 401);
}));
test('real metadata event updates only its agent', async () => withServer(async base => {
  const r = await fetch(base + '/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ version: 1, type: 'model_start', agentId: 'crypto-btc', sessionKey: 'agent:crypto-btc:main' }) });
  assert.equal(r.status, 202);
  const snap = await fetch(base + '/agents', {headers:{authorization:`Bearer ${token}`}});
  const { agents } = await snap.json();
  assert.equal(agents.length, 7);
  assert.equal(agents.find(a => a.agentId === 'crypto-btc').state, 'analisando');
  assert.equal(agents.find(a => a.agentId === 'crypto-eth').state, 'ocioso');
}));
test('unknown agent id rejected', async () => withServer(async base => {
  const r = await fetch(base + '/events', {method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({version:1,type:'model_start',agentId:'main'})});
  assert.equal(r.status, 422);
}));

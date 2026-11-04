import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const AGENTS = [
  'trading-coordinator','crypto-btc','crypto-eth','forex-eur',
  'forex-gbp','gold-analyst','risk-reviewer',
];
const VALID = new Set(AGENTS);
const STATES = { model_start: 'analisando', model_end: 'aguardando', tool_end: 'ferramenta_concluida', agent_end: 'ocioso' };
const MAX_BODY = 4096;
const IDLE_MS = 120000;

export function createReceiver({ token, now = () => Date.now() }) {
  if (!token || token.length < 24) throw Error('PIXEL_EVENTS_TOKEN must have at least 24 characters');
  const latest = new Map();
  const listeners = new Set();
  const counters = new Map(AGENTS.map(a => [a, 0]));
  const authorized = (header) => {
    const supplied = Buffer.from(header || '');
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const snapshot = () => AGENTS.map(agentId => {
    const entry = latest.get(agentId);
    const fresh = entry && now() - entry.receivedAt < IDLE_MS;
    return {
      agentId,
      state: fresh ? entry.state : 'ocioso',
      lastEvent: entry?.type ?? null,
      lastSeen: entry?.timestamp ?? null,
      sessionKey: entry?.sessionKey ?? null,
      toolName: fresh ? entry?.toolName ?? null : null,
      count: counters.get(agentId),
    };
  });
  const handler = async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    if (path === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, agentCount: 7 }));
      return;
    }
    if (!authorized(req.headers.authorization)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (path === '/agents' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ agents: snapshot() }));
      return;
    }
    if (path === '/events' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'connection': 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ agents: snapshot() })}\n\n`);
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return;
    }
    if (path === '/events' && req.method === 'POST') {
      let body = '';
      for await (const part of req) {
        body += part.toString();
        if (body.length > MAX_BODY) { res.writeHead(413); res.end(); return; }
      }
      let event;
      try { event = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
      if (event?.version !== 1 || !VALID.has(event.agentId) || !Object.hasOwn(STATES, event.type)) {
        res.writeHead(422); res.end(); return;
      }
      const timestamp = new Date(now()).toISOString();
      const state = event.type === 'agent_end' && event.success === false ? 'erro' : STATES[event.type];
      const record = {
        agentId: event.agentId, state, type: event.type,
        sessionKey: typeof event.sessionKey === 'string' ? event.sessionKey.slice(0, 160) : null,
        toolName: typeof event.toolName === 'string' ? event.toolName.slice(0, 80) : null,
        timestamp, receivedAt: now(),
      };
      latest.set(event.agentId, record);
      counters.set(event.agentId, counters.get(event.agentId) + 1);
      for (const client of listeners) client.write(`event: activity\ndata: ${JSON.stringify(record)}\n\n`);
      res.writeHead(202); res.end();
      return;
    }
    res.writeHead(404); res.end();
  };
  return { handler, snapshot };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const receiver = createReceiver({ token: process.env.PIXEL_EVENTS_TOKEN });
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 3188);
  http.createServer(receiver.handler).listen(port, host, () => console.log(`Trading event receiver listening at ${host}:${port}`));
}

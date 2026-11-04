import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// Only named Trading Room agents may be projected into the visualization.
const AGENTS = new Set([
  "trading-coordinator", "crypto-btc", "crypto-eth", "forex-eur",
  "forex-gbp", "gold-analyst", "risk-reviewer",
]);
const TARGET = process.env.PIXEL_EVENTS_URL || "";
const TOKEN = process.env.PIXEL_EVENTS_TOKEN || "";

function emit(kind: string, event: Record<string, unknown>, ctx: Record<string, unknown>) {
  const agentId = String(ctx.agentId || "");
  if (!AGENTS.has(agentId) || !TARGET || !TOKEN) return;
  // No prompt, tool arguments, tool results, messages or secrets leave OpenClaw.
  const body = JSON.stringify({
    version: 1,
    type: kind,
    agentId,
    sessionKey: typeof ctx.sessionKey === "string" ? ctx.sessionKey : null,
    runId: typeof ctx.runId === "string" ? ctx.runId : null,
    toolName: typeof event.toolName === "string" ? event.toolName.slice(0, 80) : null,
    outcome: typeof event.outcome === "string" ? event.outcome.slice(0, 40) : null,
    success: typeof event.success === "boolean" ? event.success : null,
    error: Boolean(event.error), // never send raw error text
    timestamp: new Date().toISOString(),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  // Do not await telemetry: avoid blocking model/tool execution.
  void fetch(TARGET, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${TOKEN}` },
    body,
    signal: controller.signal,
  }).catch(() => {}).finally(() => clearTimeout(timeout));
}

export default definePluginEntry({
  id: "pixel-events",
  name: "Pixel Events (Trading Room)",
  description: "Metadata-only event bridge for seven Trading Room agents",
  register(api) {
    api.on("model_call_started", (event, ctx) => emit("model_start", event, ctx));
    api.on("model_call_ended", (event, ctx) => emit("model_end", event, ctx));
    api.on("after_tool_call", (event, ctx) => emit("tool_end", event, ctx));
    // Observation only. The hook is conversation-access-gated by OpenClaw;
    // we ignore event.messages and all conversation text.
    api.on("agent_end", (event, ctx) => emit("agent_end", event, ctx));
  },
});

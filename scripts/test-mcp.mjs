const base = process.env.MCP_BASE_URL || "http://127.0.0.1:3333";

async function rpc(method, params, headers = {}) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.XHS_READER_TOKEN ? { Authorization: `Bearer ${process.env.XHS_READER_TOKEN}` } : {}), ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 100000), method, params }),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${text}`);
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body;
}

const initialized = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "local-self-test", version: "0.2.0" },
});
if (!initialized.result?.serverInfo?.name) throw new Error("initialize did not return serverInfo");

const listed = await rpc("tools/list", {});
const names = (listed.result?.tools || []).map((tool) => tool.name);
const expected = ["xiaohongshu_status", "xiaohongshu_current_page", "xiaohongshu_search", "xiaohongshu_get_note", "xiaohongshu_go_home", "xiaohongshu_back", "xiaohongshu_feed", "xiaohongshu_get_comments", "xiaohongshu_close_overlay", "xiaohongshu_load_more"];
for (const name of expected) if (!names.includes(name)) throw new Error(`missing tool: ${name}`);

const status = await rpc("tools/call", { name: "xiaohongshu_status", arguments: {} });
if (status.result?.isError || !status.result?.structuredContent || status.result.structuredContent.kind !== 'status') throw new Error("status tool did not return a valid status result");

console.log(JSON.stringify({
  ok: true,
  server: initialized.result.serverInfo,
  tools: names,
  status: { browserConnected: status.result.structuredContent.browserConnected, pageKind: status.result.structuredContent.pageKind },
}, null, 2));

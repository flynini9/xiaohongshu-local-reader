import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Real HTTP boundary, disposable server, synthetic CDP; no account or tunnel.
let cdpRequests = 0;
const cdp = http.createServer((req, res) => {
  cdpRequests++;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('[]');
});
await new Promise((resolve, reject) => {
  cdp.once('error', reject);
  cdp.listen(0, '127.0.0.1', resolve);
});
const env = { ...process.env, PORT: '0', CDP_ENDPOINT: `http://127.0.0.1:${cdp.address().port}` };
delete env.HOST;
delete env.XHS_READER_TOKEN;
// Observe the actual listen address without adding test hooks to the server.
const boot = `import net from 'node:net';
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  this.once('listening', () => process.send(this.address()));
  return listen.apply(this, args);
};
await import(${JSON.stringify(new URL('./server.mjs', import.meta.url).href)});`;
const child = spawn(process.execPath, ['--input-type=module', '-e', boot], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
let stderr = '';
child.stderr.on('data', (data) => { stderr += data.toString(); });
try {
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Transport test server startup timed out')), 7000);
    child.once('message', (message) => { clearTimeout(timer); resolve(message); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Test server exited: ${stderr}`)); });
  });
  assert.equal(address.address, '127.0.0.1', 'default binding is IPv4 loopback');
  const port = address.port;
  const safeHost = `127.0.0.1:${port}`;
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'synthetic-tunnel-http', version: '1' } } });
  async function request({ host = safeHost, path = '/mcp', method = 'POST', headers = {}, body = payload } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path, method, agent: false, setHost: false, headers: { Host: host, 'Content-Type': 'application/json', ...headers } }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      });
      req.on('error', (error) => reject(new Error(`HTTP test ${method} ${path} Host=${host}: ${error.message}`, { cause: error })));
      req.setTimeout(5000, () => req.destroy(new Error('Transport request timed out')));
      req.end(body);
    });
  }
  function noCors(response) {
    assert.ok(!Object.keys(response.headers).some((key) => key.startsWith('access-control-')), 'no CORS grants on any response');
  }
  // Original exploit: webpage POST can invoke MCP before any CDP/login is needed.
  const malicious = await request({ headers: { Origin: 'https://attacker.example' } });
  assert.equal(malicious.status, 403, 'untrusted webpage initialize must be forbidden');
  noCors(malicious);
  assert.equal(malicious.text, '{"error":"Forbidden"}', 'rejection does not reflect attacker data');
  for (const origin of ['null', '', `http://localhost:${port}`, `http://127.0.0.1:${port}`, 'https://attacker.example https://localhost']) {
    const result = await request({ headers: { Origin: origin } });
    assert.equal(result.status, 403, 'all present Origin headers rejected, including empty/null/local');
    noCors(result);
  }
  for (const path of ['/mcp', '/healthz', '/readyz', '/missing']) {
    for (const method of ['POST', 'GET', 'OPTIONS', 'DELETE']) {
      const result = await request({ path, method, headers: { Origin: 'https://attacker.example', 'Content-Type': 'text/plain' } });
      assert.equal(result.status, 403, 'guard covers preflight, simple requests, health and fallback');
      noCors(result);
    }
  }
  assert.equal(cdpRequests, 0, 'rejected requests never reach browser/CDP');
  for (const host of [safeHost, `localhost:${port}`, `LOCALHOST:${port}`]) {
    const result = await request({ host });
    assert.equal(result.status, 200, 'no-Origin local/Tunnel initialize allowed');
    assert.equal(JSON.parse(result.text).result.serverInfo.name, 'xiaohongshu-local-reader');
    noCors(result);
  }
  for (const host of ['', 'attacker.example', `attacker.example:${port}`, '127.0.0.1', `127.0.0.1:${port + 1}`, `127.0.0.1:0${port}`, `127.1:${port}`, `2130706433:${port}`, `0x7f000001:${port}`, `127.0.0.1.:${port}`, `localhost.:${port}`, `[::1]:${port}`, `localhost:${port}@attacker.example`, `127.0.0.1:${port},attacker.example`, `localhost:${port}/mcp`, `http://localhost:${port}`, `localhost:${port}#fragment`]) {
    const result = await request({ host, headers: { 'X-Forwarded-Host': safeHost, 'Forwarded': `host=${safeHost}` } });
    assert.equal(result.status, 403, `noncanonical/malformed Host rejected: ${host}`);
    noCors(result);
  }
  for (const path of [`http://attacker.example:${port}/mcp`, `http://${safeHost}/mcp`, '//attacker.example/mcp', '/\\attacker.example/mcp', '*']) {
    const result = await request({ path });
    assert.equal(result.status, 400, 'only origin-form request targets accepted');
    noCors(result);
  }
  // Raw duplicate/missing fields cannot be hidden by Node's header normalization.
  async function raw(headers) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      let text = '';
      socket.setEncoding('utf8');
      socket.setTimeout(5000, () => socket.destroy(new Error('Raw request timed out')));
      socket.on('error', (error) => reject(new Error(`Raw header test failed: ${error.message}`, { cause: error })));
      socket.on('data', (data) => { text += data; });
      socket.on('end', () => resolve(text));
      socket.on('connect', () => socket.write(`GET /healthz HTTP/1.1\r\n${headers}Connection: close\r\n\r\n`));
    });
  }
  for (const fields of ['', `Host: ${safeHost}\r\nHost: attacker.example\r\n`, `Host: attacker.example\r\nHost: ${safeHost}\r\n`, `Host: ${safeHost}\r\nOrigin: \r\nOrigin: https://attacker.example\r\n`]) {
    const response = await raw(fields);
    assert.match(response, /^HTTP\/1\.1 (?:400|403) /, 'HTTP parser or guard rejects ambiguous headers');
    assert.doesNotMatch(response, /Access-Control-/i);
  }
  const health = await request({ path: '/healthz', method: 'GET', body: '' });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.text).ok, true);
  noCors(health);
  const ready = await request({ path: '/readyz', method: 'GET', body: '' });
  assert.equal(ready.status, 200, 'synthetic CDP reachable');
  const list = await request({ body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), headers: { 'MCP-Protocol-Version': '2025-03-26', 'Mcp-Session-Id': 'synthetic-session', 'X-Forwarded-Host': 'attacker.example' } });
  assert.equal(list.status, 200);
  const expected = ['xiaohongshu_status', 'xiaohongshu_current_page', 'xiaohongshu_search', 'xiaohongshu_get_note', 'xiaohongshu_feed', 'xiaohongshu_get_comments', 'xiaohongshu_close_overlay', 'xiaohongshu_go_home', 'xiaohongshu_back', 'xiaohongshu_load_more'];
  assert.deepEqual(JSON.parse(list.text).result.tools.map((tool) => tool.name), expected);
  const status = await request({ body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'xiaohongshu_status', arguments: {} } }) });
  assert.equal(status.status, 200);
  assert.equal(JSON.parse(status.text).result.structuredContent.kind, 'status');
  assert.equal(JSON.parse(status.text).result.structuredContent.browserConnected, true);
  const preflight = await request({ method: 'OPTIONS', body: '' });
  assert.equal(preflight.status, 204);
  noCors(preflight);
  assert.equal((await request({ method: 'DELETE', body: '' })).status, 204);
  assert.equal((await request({ method: 'GET', body: '' })).status, 405);
  console.log('PASS transport security: default binding, Origin/Host/target guards, no CORS, health, ten tools, synthetic Tunnel-style HTTP/status');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  await new Promise((resolve) => cdp.close(resolve));
}

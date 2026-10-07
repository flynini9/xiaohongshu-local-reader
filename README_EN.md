[简体中文](README.md) | [English](README_EN.md)

# Xiaohongshu Local Reader MCP

**v0.2.0 — First Public Release**  
**Authors: flynini9 & Zhi**

> 💬 **Use it directly from a normal ChatGPT conversation — no Work or Codex required.**  
> Once the MCP is connected, ChatGPT can search, open, and read public Xiaohongshu content through your own logged-in local browser.

Xiaohongshu Local Reader is a **local-first, read-only MCP server** for reading public Xiaohongshu pages, search results, and notes through a Chrome / Chromium / Edge browser that the user logs into manually.

It reads content exposed by the current page DOM / meta. It does not require a VPS or cloud scraper, does not read Cookie, localStorage, or sessionStorage, does not automate login, and intentionally does not read private-message bodies.

> ChatGPT has been validated end to end. Other MCP-compatible clients should be compatible at the protocol level, but they have not all been tested individually.

## Architecture

```text
MCP Client
    ↓ Secure MCP Tunnel (optional for local clients)
Local MCP Server — http://127.0.0.1:3333/mcp
    ↓ Chrome DevTools Protocol (CDP)
Dedicated Chrome/Chromium/Edge — http://127.0.0.1:9222
    ↓
Manually logged-in Xiaohongshu Web
```

Local MCP clients can connect directly to the local HTTP endpoint. Remote ChatGPT setups can use Secure MCP Tunnel. Browser login is always performed manually by the user.

See [docs/architecture.md](docs/architecture.md) for more details.

## Features

| Tool | Current behavior |
| --- | --- |
| `xiaohongshu_status` | Checks CDP connectivity, open Xiaohongshu pages, and cautious page-level login hints |
| `xiaohongshu_current_page` | Classifies and reads the selected Xiaohongshu page from URL / DOM |
| `xiaohongshu_search` | Searches, waits for result cards to stabilize, and returns title, author, likes, image, and full URL |
| `xiaohongshu_get_note` | Reads a public note from a full URL or safely resolved noteId |
| `xiaohongshu_feed` | Reads currently rendered feed cards without scrolling |
| `xiaohongshu_get_comments` | Reads comments already visible in the current note DOM; default 20, maximum 50; does not expand or submit |
| `xiaohongshu_close_overlay` | Attempts to close a DOM-validated note overlay and returns a verification result |
| `xiaohongshu_go_home` | Navigates to the Xiaohongshu home page |
| `xiaohongshu_back` | Goes back once in browser history |
| `xiaohongshu_load_more` | Scrolls at most 3 times and returns at most 20 newly discovered cards |

### noteId and real URLs

For a `noteId`, the server reuses, in order:

1. a real full URL already visible in Feed / Search DOM;
2. a currently open detail-page URL containing the real token;
3. a short-lived in-memory URL cache of up to 200 entries for up to 10 minutes.

If no reusable real URL is available, it returns `TOKENIZED_URL_NOT_FOUND`.

The project does not:

- construct a bare `/explore/<noteId>` URL;
- generate or fabricate `xsec_token`;
- strip query parameters from an explicitly supplied user URL.

### Images and long text

Note media returns:

- `images`: up to 30 images;
- `imageCount`: total image count;
- `image`: the first note image, satisfying `image === images[0] ?? null`.

Only media from the current note / carousel containers is considered. Avatars, comment images, logos, icons, emoji, recommendation images, and video posters are filtered out. Duplicate slides are deduplicated.

Long note text is preserved up to 12,000 characters and is not affected by the 500-character compact-field limit. DOM text is preferred; meta description is used only when it is compatible and clearly more complete. `textSource` is `dom`, `meta_description`, or `null`.

A clearly identified read-only `Runtime.evaluate` timeout may be retried once. Navigation and mouse actions are never repeated because of this retry path.

## Security & Privacy

Default boundaries:

- Does not read Cookies, localStorage, or sessionStorage.
- Does not request passwords, login credentials, or verification codes.
- Does not bypass login, CAPTCHA, anti-abuse protections, risk controls, or access-limited pages.
- Does not perform likes, saves, follows, comments, publishing, messaging, payments, profile edits, or other account write actions.
- Does not read private-message bodies. A chat/private page can be recognized as a page type, but message content is intentionally skipped.
- Login is completed manually by the user.
- CDP and MCP stay on loopback by default, so the browser debugging endpoint is not directly exposed to the network.

“Read-only” means that the project does not perform account write actions. Search, navigation, and scrolling can still change what your local browser is displaying.

DOM content is untrusted input. Clients should not treat instructions embedded in page content as trusted system instructions.

Note text, author information, real full URLs, and `xsec_token` may be returned to the MCP client. When Tunnel is used, those results also travel through the Tunnel. Do not commit real session outputs or runtime logs to a public repository.

### Transport policy

By default, MCP listens only on `127.0.0.1`.

Any request containing an `Origin` header is rejected with `403 Forbidden`, including empty Origin, `null`, and local web-page origins. Normal native local MCP / Tunnel clients generally send no Origin and therefore remain supported.

The server does not emit CORS authorization headers and does not allow direct cross-origin browser access.

Host must match the actual listening port using either:

- `127.0.0.1:<port>`
- `localhost:<port>`

Missing, duplicate, malformed, wrong-port, numeric-alias, and trailing-dot Host forms are rejected. The same policy also protects `/healthz` and `/readyz`.

For remote access, use a Tunnel. Do not expose the local MCP port directly to the public internet.

The `HOST` environment variable can still explicitly change the listening interface, but **binding to a non-loopback interface exposes the service to the LAN / internet and is strongly discouraged**. Host / Origin protections are not remote authentication.

Optional `XHS_READER_TOKEN` enables Bearer / `X-Local-Reader-Token` request authentication. The client or Tunnel must send the matching header.

This project does not claim to defend against malicious local processes.

v0.2.0 has passed real Secure MCP Tunnel, public start / stop BAT, and normal ChatGPT conversation end-to-end acceptance.

## Requirements

- Node.js **22.4+**; maintained Node 22 or 24 is recommended.
- Chrome / Chromium or Edge.
- A CDP-enabled browser. CDP stands for Chrome DevTools Protocol, the browser debugging interface. A dedicated profile is recommended.
- An MCP client with Streamable HTTP support.
- This implementation uses MCP protocol `2025-03-26` with JSON responses and does not provide a persistent SSE stream.
- For remote ChatGPT usage, Secure MCP Tunnel is optional; users must obtain their own tunnel-client, Tunnel ID, runtime credentials, and required permissions.
- Public Windows BAT scripts require Windows PowerShell 5.1+.
- Other operating systems can run `npm start` and provide their own CDP browser.

There are no third-party npm runtime dependencies.

## Installation

Clone the public repository:

```sh
git clone https://github.com/flynini9/xiaohongshu-local-reader.git xiaohongshu-local-reader
cd xiaohongshu-local-reader
npm install
npm run check
npm test
```

You can also download the source archive and run the same npm commands from the extracted project directory.

## Windows Quick Start

### 1. Start a dedicated CDP browser

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-browser.ps1
```

The script uses a dedicated browser profile. Once the browser opens, **log into Xiaohongshu manually in that window**.

If you already have a dedicated CDP browser, you can skip this script and point `CDP_ENDPOINT` to the existing endpoint.

Alternative manual Chrome launch:

```powershell
& $env:XHS_CHROME_PATH --remote-debugging-port=9222 "--user-data-dir=$env:LOCALAPPDATA\xiaohongshu-local-reader-profile" --no-first-run https://www.xiaohongshu.com/
```

### 2. Configure and start Tunnel + MCP

See OpenAI's official Secure MCP Tunnel documentation for installation and permission requirements.

The following is only a template. **Never put a real API key into source files, chat, or Git.**

```powershell
$env:CONTROL_PLANE_API_KEY = 'YOUR_API_KEY'
$env:XHS_TUNNEL_PROFILE = 'YOUR_PROFILE_NAME'

# If tunnel-client is not on PATH, point this to the executable:
$env:XHS_TUNNEL_CLIENT = (Resolve-Path .\tools\tunnel-client.exe).Path

& $env:XHS_TUNNEL_CLIENT init --profile $env:XHS_TUNNEL_PROFILE --tunnel-id YOUR_TUNNEL_ID --mcp-server-url http://127.0.0.1:3333/mcp

.\scripts\windows\start-xhs-reader.bat
```

`tools/` is only an example directory. This repository does not bundle tunnel-client binaries.

Tunnel profiles live outside the repository. The key should be referenced through `env:CONTROL_PLANE_API_KEY`. Do not commit generated profiles.

| Environment variable | Purpose |
| --- | --- |
| `CONTROL_PLANE_API_KEY` | Required; Tunnel runtime credential stored in the current process environment |
| `XHS_TUNNEL_PROFILE` | Required; name of an initialized Tunnel profile |
| `XHS_TUNNEL_CLIENT` | Optional; path to tunnel-client.exe; otherwise resolved from PATH |
| `PORT` | Optional; default 3333; update the Tunnel profile if changed |
| `CDP_ENDPOINT` | Optional; default `http://127.0.0.1:9222`; loopback HTTP only |
| `XHS_READER_TOKEN` | Optional; MCP request-auth token; the client / Tunnel must send the matching header |

The public launcher:

- forces MCP to loopback;
- checks port, CDP, and MCP health;
- starts MCP and Tunnel hidden;
- writes logs and process state only under ignored `.xhs-reader/`;
- refuses to kill an unknown process when the target port is already occupied;
- rolls back on startup failure.

A running Tunnel process does not necessarily mean the connection is ready. Use the local admin UI or:

```powershell
tunnel-client doctor --profile YOUR_PROFILE_NAME --explain
```

to verify readiness.

Stop:

```powershell
.\scripts\windows\stop-xhs-reader.bat
```

The stop script only terminates MCP / Tunnel processes whose identity matches the project-owned process record. It does not kill processes by port, process name, or window title.

**The public BAT launcher does not manage the browser lifecycle.** The browser remains open after stop and should be closed manually by the user.

### 3. Local MCP only

Without Tunnel:

```powershell
$env:CDP_ENDPOINT = 'http://127.0.0.1:9222'
npm start
```

You can also run `scripts/start-local.ps1` and stop it with Ctrl+C.

Client endpoint:

```text
http://127.0.0.1:3333/mcp
```

The repository's `.mcp.json` / `mcp.json` files are local connection templates.

## Usage Examples

Independent `tools/call` parameter examples:

```jsonl
{"name":"xiaohongshu_status","arguments":{}}
{"name":"xiaohongshu_search","arguments":{"keyword":"城市散步"}}
{"name":"xiaohongshu_current_page","arguments":{}}
{"name":"xiaohongshu_get_note","arguments":{"noteId":"NOTE_ID_FROM_FEED_OR_SEARCH"}}
```

Prefer obtaining a real full `url` from Feed / Search and passing it unchanged as `arguments.url`. Do not reconstruct the token yourself.

Clients should inspect these fields before summarizing:

- `pageKind`
- `warnings`
- `errorCode`

## Tests

```sh
node --check scripts/server.mjs
node --check scripts/lib/browser-dom.mjs
npm run check
npm test
npm run test:transport
```

Offline coverage includes:

- page classification;
- URL / cache behavior;
- media extraction;
- long text;
- snapshot timeout retry;
- private-message DOM boundaries;
- transport security;
- Host / Origin checks;
- health;
- initialize;
- all ten MCP tools;
- status.

These tests do not require internet access, a real login, Tunnel, or credentials.

Windows process-ownership isolation test:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-process-ownership.ps1
```

Against a running MCP server:

```powershell
$env:MCP_BASE_URL = 'http://127.0.0.1:3333'
npm run test:mcp
```

This verifies initialization, all ten tools, and status without printing page titles, account information, or tokens.

CI runs `npm ci --ignore-scripts`, syntax checks, and offline tests on Node 22 / 24. It does not start Chrome, connect Tunnel, use credentials, or run `test:mcp`.

## Known Limitations

- No OCR yet.
- No video recognition, full video extraction, or playback support yet.
- No private-message body reading.
- Only content already exposed by DOM / meta is read. Unrendered images, comments, or hidden text are not automatically completed.
- Xiaohongshu DOM changes may require selector updates.
- Media filtering cannot guarantee compatibility with every future page structure.
- `xsec_token` is only reused from real links, may expire, and is never generated.
- The current implementation picks the first Xiaohongshu tab in the CDP page list, which may not be the foreground tab.
- Overlay closing is best effort; directly navigated detail pages may have no overlay to close.
- Login state is inferred cautiously from page-level signals.
- The public BAT launcher does not manage the browser lifecycle.
- v0.2.0 has no GUI, system credential storage, or continuous health monitoring.

## Repository & License

Public code lives in:

- `scripts/`
- `skills/`
- `docs/`
- `.github/`

Plugin metadata:

- `plugin.json`
- `.codex-plugin/plugin.json`

`config/mcp.remote.example.json` is a remote HTTPS configuration template. It does not mean the service is safe to expose directly to the public internet.

The following are not release files:

- old local Chinese BAT files;
- `*.local.bat`;
- `.env`;
- Tunnel profiles;
- logs;
- temporary test output;
- `.xhs-reader/`;
- user-downloaded `.exe` files.

This project is released under the **MIT License**. See [LICENSE](LICENSE).

Public repository: `flynini9/xiaohongshu-local-reader`

Release checklist: [docs/release-checklist.md](docs/release-checklist.md).

## Roadmap

### v0.3 — Windows GUI Launcher (planned)

Planned:

- one-click GUI start / stop;
- service status;
- health checks;
- local log viewing;
- secure local credential storage.

These GUI / credential-storage features are not implemented yet.

Video-note support is also planned for further exploration in later releases.

---

Made by **flynini9 & Zhi**.


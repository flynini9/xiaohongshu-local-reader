# Architecture

```text
ChatGPT web / mobile app
          |
          |  ChatGPT developer-mode App -> OpenAI Secure MCP Tunnel
          v
local tunnel-client (outbound HTTPS only)
          |
          v
127.0.0.1:3333/mcp  --  xiaohongshu-local-reader/scripts/server.mjs
          |
          v
Chrome/Edge CDP at 127.0.0.1:9222
          |
          v
user's manually logged-in Xiaohongshu page
```

The bridge reads rendered page state through Chrome DevTools Protocol. `page-state.mjs` classifies the final URL and visible DOM signals; `browser-dom.mjs` extracts bounded cards, note fields, body-media candidates, and currently visible comments. `note-media.mjs` filters body images and deduplicates carousel clones. Search polling has a timeout and returns a warning on partial rendering. Card URLs retain their original query strings, including `xsec_token`. `note-url.mjs` validates real tokenized card links; a bounded in-memory cache holds only recently observed links. A `noteId` lookup never constructs a bare note URL.

Navigation is limited to browser history, home, and closing a note overlay. The close operation checks a visible close control first and a safe backdrop point second, then sends CDP mouse events and verifies the outcome. Optional scrolling has strict count and item caps. No arbitrary coordinate click, cookie or storage read, private API call, social write operation, or bypass is exposed. The MCP server is bound to loopback by default.

Local MCP clients may bypass the tunnel and connect directly. The first Xiaohongshu CDP target is selected; it is not guaranteed to be the foreground tab. Browser login is manual. For noteId resolution the order is visible Feed/Search links, an already-open tokenized detail page, then the memory cache (200 entries, 10-minute TTL). Missing URLs return TOKENIZED_URL_NOT_FOUND without navigation; explicit URL inputs preserve the supplied HTTPS Xiaohongshu URL. Tokens are never generated.

Body media is scoped to the current note media/carousel root and capped at 30 images, with context/size filtering and slide deduplication. The fields obey image === images[0] ?? null and imageCount === images.length. Filtering is heuristic and DOM-dependent. Text is capped at 12000 characters; DOM is preferred unless a compatible meta description is more complete. textSource records dom, meta_description, or null. Every snapshot uses retry-snapshot.mjs: only the exact Runtime.evaluate timeout gets one retry after 250 ms. No navigation or mouse event is retried by that helper.

Chat/message/notification paths suppress body signal text and note extraction; the tools do not return private message bodies. Public note results may contain author names and real tokenized URLs, which are forwarded through the chosen client/tunnel. Do not persist actual results in the repository. Access-limited/login/error pages are classified and reported rather than bypassed. Overlay closure is best effort; inspect closed and warnings.

## Transport boundary

Default binding is 127.0.0.1. A shared HTTP guard runs before URL parsing, body reads, routing or CDP calls, including health/readiness/fallback routes. Every present Origin header is rejected with 403 (including empty, null, duplicates and local webpage origins); absence is allowed for native MCP/Tunnel/PowerShell clients. No Access-Control-* grants are emitted, including on errors or OPTIONS.

Exactly one raw Host field must match 127.0.0.1:<bound-port> or localhost:<bound-port>, case-insensitively. Match the raw authority without URL normalization: no numeric aliases, trailing dots, userinfo, malformed ports or forwarded-host trust. The port is the actual server listen port (including ephemeral test ports). Standard omission of :80 is allowed on port 80. Only an explicit actual ::1 binding additionally permits [::1]:<port>. Missing/duplicate/untrusted Host returns 403. Only slash-prefixed origin-form request targets are accepted; absolute targets, network paths and backslashes return 400. Route parsing uses a fixed base rather than attacker-controlled Host.

HOST remains an explicit override; non-loopback binding is dangerous and unsupported as a secure public deployment. Host/Origin checks restrict webpage access and DNS-rebinding authorities, not malicious native clients that can forge headers. Existing optional XHS_READER_TOKEN authorization on /mcp is unchanged; health endpoints do not require this token but do enforce Host/Origin. No OAuth, session authentication or new token protocol was added. MCP transport still returns JSON for protocol 2025-03-26; no persistent SSE stream is implemented.

Tunnel template upstream is http://127.0.0.1:3333/mcp. The installed tunnel-client 0.0.14 source uses a StreamableClientTransport endpoint from ServerURL and applies forwarded/static headers without rewriting req.Host; the default HTTP authority derives from that endpoint. No OpenAI-origin allowlist is needed. Requests that carry an Origin (including operator-supplied extra headers) are deliberately rejected. Automated tests simulate native no-Origin forwarding and protocol headers; they are not real Tunnel acceptance. See README for source links and manual validation requirements.

## Windows lifecycle

Public BAT wrappers resolve xhs-reader.ps1 relative to themselves. The helper requires a process-environment control-plane key, initialized profile, and tunnel-client from PATH or XHS_TUNNEL_CLIENT. MCP binds loopback and the helper checks a free port, browser CDP, and MCP health; it does not guarantee tunnel readiness. Stop validates saved PID/start time/executable/command line and never kills by port or global process name. A project-local lock serializes launcher operations. State and local logs live in ignored .xhs-reader/. The browser is started manually using a dedicated profile and remains open when public stop runs. Existing local developer scripts are excluded from publication.

CI only runs syntax and offline tests, including isolated transport HTTP tests with synthetic CDP. test:mcp is a separate local protocol/status probe, not browser end-to-end acceptance. v0.3 GUI launcher and secure credential storage are planned, not implemented.

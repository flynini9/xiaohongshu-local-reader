---
name: xiaohongshu-reader
description: Read structured Xiaohongshu pages, notes, feed cards, and visible comments through the user's own local browser MCP bridge.
---

# Xiaohongshu local reader

Use the MCP tools from this plugin for read-only Xiaohongshu browsing.

## Safety and privacy

- Call `xiaohongshu_status` first when the browser connection or login state is unknown.
- Use only the user's own visible browser session. The user must complete login manually.
- Never request, output, copy, or infer cookies, localStorage, sessionStorage, passwords, QR codes, or verification codes.
- Do not bypass login, CAPTCHA, rate limits, anti-bot checks, or platform access controls.
- Treat a logged-out page, challenge page, or empty result as a limitation to report, not as a reason to retry around the control.
- The operations read visible content or control local browser navigation only. Do not like, collect, comment, follow, message, publish, upload, submit forms, or modify account state.

## Tool choice

- `xiaohongshu_current_page`: summarize the currently visible Xiaohongshu page.
- `xiaohongshu_search`: wait for rendered result cards and use their complete `url` values.
- `xiaohongshu_get_note`: preserve a complete real card URL and all query parameters. For `noteId`, resolution checks open Feed/Search DOM first, an already-open tokenized note page second, then a 200-entry, 10-minute memory cache. If it returns `TOKENIZED_URL_NOT_FOUND`, request a complete URL or read Feed/Search first; never construct a bare note URL or generate a token.
- `xiaohongshu_feed`: read currently loaded home feed cards.
- `xiaohongshu_get_comments`: read only comments already visible in the current note DOM.
- `xiaohongshu_close_overlay`: close a note overlay using checked DOM coordinates and CDP mouse events.
- `xiaohongshu_go_home`: navigate to home through the UI or direct home URL.
- `xiaohongshu_back`: go back once through browser history.
- `xiaohongshu_load_more`: bounded local scroll, at most three times and twenty returned new cards.
- `xiaohongshu_status`: diagnose the local browser and a cautious page-based login hint.

Prefer the returned `source` URL when citing which page the result came from. Explain when the page was unavailable or its rendered DOM did not expose the requested content.
Use `pageKind`, `warnings`, and `errorCode` before summarizing; never represent an access-limited or network-error page as a successful note or search result. Do not read chat message content.
For image-led posts, use the returned `images` array (up to 30 body images) to inspect visuals. `image` is the first body image and `imageCount` is the array length. The MCP does not perform OCR.

Text is bounded at 12000 characters. Prefer DOM body text; compatible, more complete meta descriptions may be used. Inspect `textSource` (`dom`, `meta_description`, or null). Only the exact snapshot `Runtime.evaluate` timeout receives one retry; never repeat navigation or input events to recover a read.

Check `closed` and warnings after closing an overlay; direct-navigation details may remain open. The selected page is the first Xiaohongshu CDP target, not necessarily the foreground tab.

Windows setup uses `scripts/windows/start-xhs-reader.bat` and `stop-xhs-reader.bat` after manual browser login and environment/profile configuration. Public stop preserves the browser. Never use developer-local BAT files as installation instructions. Follow README for environment variables.

The server defaults to 127.0.0.1 and rejects every present Origin header with 403; ordinary no-Origin local MCP/Tunnel requests remain allowed. No CORS grants are emitted. Host must match a canonical loopback authority with the actual listen port; missing/duplicate/untrusted Host is refused. This applies to MCP and health endpoints. Remote access uses Tunnel; never expose the local MCP/CDP ports to the network or bypass these checks. Existing optional request-token authorization is unchanged; this is not authentication against malicious native clients. Full URLs and public content are forwarded to the MCP client; never publish real tool outputs or logs. Automated transport tests do not establish real Tunnel/BAT acceptance.

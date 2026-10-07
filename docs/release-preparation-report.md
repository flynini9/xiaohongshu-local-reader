# v0.2.0 release preparation report

Conclusion: **READY FOR REPOSITORY SETUP**. Local release preparation, transport hardening, public Windows launcher validation and live Tunnel/browser acceptance are complete. No GitHub repository, push, Release, npm publish or external upload has been performed. Version remains 0.2.0. Before the first push, create/select the GitHub repository, replace the README clone placeholder, and re-audit the staged diff for secrets/private files.

## Files

Modified during initial preparation: README.md, docs/architecture.md, skills/xiaohongshu-reader/SKILL.md, package.json, plugin.json, scripts/start-browser.ps1, scripts/run-tunnel.ps1, scripts/test-mcp.mjs. Subsequent transport fix: scripts/server.mjs, package.json, README, architecture, SKILL, release checklist and this report; added scripts/test-transport-security.mjs. No Windows, existing lib, ignore, CI or lockfile changes in the transport fix.

Added: .gitignore, package-lock.json, .github/workflows/test.yml, scripts/check-syntax.mjs, scripts/test-privacy.mjs, scripts/windows/start-xhs-reader.bat, scripts/windows/stop-xhs-reader.bat, scripts/windows/xhs-reader.ps1, scripts/windows/process-ownership.ps1, scripts/windows/test-process-ownership.ps1, docs/release-checklist.md, this report.

Private local additions: start-xhs-reader.local.bat and stop-xhs-reader.local.bat, exact copies of the existing developer scripts. Both original developer BAT files remain unchanged and are explicitly ignored. No private script was deleted. Local .xhs-reader/ test logs and launcher lock are ignored; no real page samples were saved.

## Security

Whole-project pre-edit inspection found developer-specific paths and fixed local settings in the original BAT, but no real API key, cookie, session credential or private account/message fixture. Test token literals are synthetic. Public candidate files exclude private BAT/state/logs and contain no identified developer absolute paths or real credentials. Pattern scanning is supplementary to manual inspection, not proof against all possible secret formats.

This directory has no valid Git history; no known committed credential requires history cleanup or rotation. Outside browser authentication stores and tunnel private configuration were not opened. Future staged files still require a fresh review.

The original transport blocker was confirmed and subsequently repaired: a malicious-Origin initialize returned 200 before the patch; shared Host/Origin checks now reject it with 403, emit no CORS grants and guard all HTTP endpoints before routing/CDP. Default bind remains 127.0.0.1. Strict authority/duplicate-header/alternate-request-target tests accompany the fix. Existing optional authentication is unchanged; native clients can forge headers, so this is not authentication against malicious local processes. Live Tunnel/BAT acceptance has since passed, and the owner selected MIT so the LICENSE requirement is complete.

## Windows scripts

Original start uses local project/client paths and fixed profile/ports. Original stop uses port/process-command/window matching and can affect unrelated listeners. They are private references, not public launchers.

Public BAT resolves its helper relative to itself. The helper requires an initialized profile and process-environment CONTROL_PLANE_API_KEY, resolves tunnel-client from environment/PATH, validates loopback CDP, checks the MCP port and health, and records process identity under ignored .xhs-reader/. No key is placed on a command line or in a script/state record. Public stop pins the process handle and validates PID, start time, executable and command line, refusing mismatches. It preserves the separately opened browser and other services. Startup failure cleans its own newly created processes. Local logs must stay private.

Browser startup now quotes profile paths containing spaces and deliberately shows the interactive login window. MCP/Tunnel background windows remain hidden. During live Windows acceptance, two launcher defects were found and fixed: start-browser.ps1 now forces the filtered browser candidate collection to remain an array so a single surviving path is not indexed as one character, and xhs-reader.ps1 no longer wraps the JSON process-record array inside a second array during stop. After these fixes, the public start wrapper reached a healthy MCP on 3333 and a live Tunnel path usable from ChatGPT; the public stop wrapper removed only its launcher-owned MCP and XHS Tunnel, preserved the separately opened browser on CDP 9222, preserved an unrelated tunnel-client process, and removed .xhs-reader/processes.json.

## Documentation and metadata

README now covers introduction/architecture, ten tools, token reuse/cache, multi-image fields, long text/textSource/retry, privacy and transport caveats, requirements, install placeholders, Windows/environment steps, usage, tests, limitations and planned v0.3 GUI launcher. SKILL and architecture were synchronized. Secure MCP Tunnel commands were checked against local tunnel-client help and linked official documentation; account availability is not promised.

Node engine >=22.4.0 and keywords were added; version/private package status retained. Lockfile added for npm ci. No repository URL was invented. The prior unconfirmed MIT declaration in plugin.json was removed during initial preparation. The owner subsequently selected MIT: a standard root LICENSE was added and package.json now declares license MIT. plugin.json currently has no license field and was left unchanged. No LICENSE-related publication blocker remains.

## Tests

- PASS node --check scripts/server.mjs and scripts/lib/browser-dom.mjs.
- PASS npm run check: all scripts/**/*.mjs, including note-url, note-media, note-text, retry-snapshot and added scripts.
- PASS npm test: classifier (10 cases), note URL/cache/media, long text/retry, synthetic private-body suppression.
- PASS npm ci --ignore-scripts --no-audit --no-fund.
- PASS PowerShell parser checks for every .ps1.
- PASS missing-key preflight rejection and empty-state stop.
- PASS isolated Windows ownership test: mismatched time/path/command line refused, owned disposable Node stopped, unrelated disposable Node preserved, repeated stop harmless. Sandbox CIM access initially failed; rerun outside sandbox passed.
- PASS npm run test:mcp using a temporary service on 3334, all ten tools and valid status returned. browserConnected=false, pageKind=unknown: no live browser acceptance claimed. Sandbox loopback access initially failed; rerun outside sandbox passed. Only the temporary service was stopped.
- CI configuration runs Node 22/24 syntax and offline tests without credentials or CDP/Tunnel. Hosted Actions were not run because no GitHub repository was created.

## Independent reviewer

Read-only reviewer found the existing cross-origin authorization issue, an unrecorded-process cleanup gap, profile-path quoting, process-handle pinning and hidden interactive browser mismatch. Script defects were repaired; transport risk remains clearly disclosed. Reviewer found no real key/developer path in public candidates, no ignored public source and no CI credential/browser requirement. Final review confirms documentation does not overstate capabilities or validation.

The paragraph above records the initial preparation review. The subsequent transport patch removes the original cross-origin defect rather than retaining it as an accepted risk. A fresh independent read-only transport reviewer found no concrete surviving cross-origin/DNS-rebinding bypass or unintended compatibility regression in the authorized scope. The common gate covers all routes, raw duplicate headers are accounted for, and native no-Origin client/launcher templates match the policy. The reviewer did not run tests, access Chrome or connect a Tunnel. Port-80 omission and explicit IPv6 acceptance branches were reviewed statically; runtime regression coverage targets IPv4 loopback and ephemeral ports.

## Transport fix validation

Before the patch, isolated malicious-Origin initialize reproduced HTTP 200. After the patch it returns 403 with a constant Forbidden message and no CORS grants. Shared guards also cover health/readiness/errors, preflight and simple requests; canonical Host/no-Origin local controls remain 200. Tests additionally reject duplicate/missing Host, numeric/hex IP aliases, trailing dots, userinfo, wrong ports, null/empty/duplicate Origin, absolute/network-path/backslash targets, and forwarded-host bypass attempts. No rejected request reaches synthetic CDP.

PASS npm run check, npm test, npm run test:transport, npm ci --ignore-scripts --no-audit --no-fund. Transport HTTP testing initially encountered sandbox loopback EACCES; the permitted outside-sandbox run passed. Test-client connection reuse and automatic empty-Host synthesis were corrected so each malicious case is sent as intended. PASS separate npm run test:mcp against a temporary server on 3334 (CDP intentionally unreachable): initialize, all ten tools and valid status; browserConnected=false. Only the temporary process was stopped, with no user browser/Tunnel interaction.

Direct source comparison confirms the original tool definitions, business handlers and MCP method dispatcher are unchanged. SHA-256 comparison confirms all existing libs, public Windows scripts/tests, .gitignore, CI and lockfile are unchanged. Actual default listen address was observed as 127.0.0.1 in the automated test.

Tunnel compatibility is now both regression-tested and live-accepted. Installed tunnel-client 0.0.14 uses the configured HTTP endpoint to construct its Streamable transport and applies headers without overriding request Host. Ordinary no-Origin endpoint requests and MCP/session headers pass the automated tests. In the live acceptance, ChatGPT successfully reached the local reader through the Tunnel and exercised status, search and note reads against the logged-in browser. Forwarded or operator-supplied Origin remains intentionally forbidden.

## Owner decisions / blockers

1. LICENSE complete: MIT selected by the owner, standard root LICENSE added and package.json synchronized. No further license decision is required.
2. Transport Host/Origin/CORS blocker is repaired, regression-tested and live-accepted through the real Tunnel. Do not expose the server publicly.
3. Public Windows start/stop + browser/Tunnel acceptance complete. Live status/search/note reads, multi-image/long-text extraction, chat-page privacy behavior and safe stop behavior passed.
4. Create/select the repository name/URL and replace the README clone placeholder. Suggested name: xiaohongshu-local-reader.
5. Re-audit the staged diff before the first push. Keep ignored local state/logs, browser profiles, Tunnel configuration and credentials out of Git.
6. Whether to create a GitHub Release is a separate later decision. No publication has been performed yet.

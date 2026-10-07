# v0.2.0 first public release checklist

Status: **READY FOR REPOSITORY SETUP**. Core code, security, Windows launcher and live Tunnel/browser acceptance are complete. No external publication has been performed. Before the first push, create/select the GitHub repository, replace README's clone placeholder, and re-audit the staged diff for secrets/private files.

## Required before publication

- MIT License selected by the owner. Standard terms are in the root [LICENSE](../LICENSE), and package.json declares license MIT. No LICENSE-related publication blocker remains. plugin.json has no license field and its structure was left unchanged.
- Transport attack-surface fix implemented: default 127.0.0.1 binding, strict raw Host validation, every present Origin rejected, no CORS grants, and alternate authority request targets rejected across all endpoints. Existing optional token is unchanged. Automated regression tests and live Tunnel acceptance both pass. Do not expose the listener publicly or mistake these guards for native-client authentication.
- Public Windows start/stop wrappers were validated on a real Windows host with an initialized Tunnel profile and process-environment credential. Browser/CDP 9222, local MCP 3333, ChatGPT-to-Tunnel-to-MCP status/search/note reads, multi-image/long-text extraction and the chat-page privacy boundary passed. Stop removed the launcher-owned MCP and XHS Tunnel, preserved the separately opened browser, preserved an unrelated tunnel-client process, and removed launcher state.
- Create/select the GitHub repository name and URL, then replace README's clone placeholder and optionally add package.repository. The suggested name remains xiaohongshu-local-reader; no remote repository has been created yet.
- Decide separately whether and when to create a Release after those requirements are met. Preparation does not authorize uploading or publishing.

## Public file boundary

Publish source, docs, skills, package metadata/lock, .gitignore, plugin templates and .github workflow. Do not upload the whole development directory manually. Four private BAT files are excluded: the original developer start/stop files and their *.local.bat backups. Originals remain unchanged so the existing developer setup is preserved; their old port/process-matching stop behavior is not recommended for public users.

.xhs-reader/, environment files, local configs, tunnel profiles, dedicated browser profiles, logs, crash dumps, cached/session data and downloaded binaries are excluded. A .gitignore rule cannot remove a file already tracked in Git. Re-audit the staged diff before the first commit; never print a detected credential value.

## Audit scope and findings

Before edits, all project files (including hidden metadata, source, tests, JSON, PowerShell and both BAT scripts) were inspected for credentials, private paths, account data and artifacts. The original BAT referenced a developer-specific project location, a locally installed tunnel-client directory, a fixed profile and ports. No actual key, cookie, session credential, account ID or private-message sample was found. Token literals in tests are deliberately synthetic (DOM_ONLY, opaque, x), not captured URLs. Keep future fixtures synthetic.

The project directory was not part of a Git worktree and contained no .git history during this audit. There is no known committed-secret history to clean and no detected credential requiring rotation. This conclusion covers this repository and directly referenced startup scripts; it does not certify outside browser profiles, the tunnel client's private configuration directory, unrelated files, backups or remote repositories. No authentication storage was opened.

## Validation scope

- npm run check: syntax checks every scripts/**/*.mjs.
- npm test: offline synthetic classifier, URL/cache, media, text/retry and privacy fixtures.
- npm run test:transport (also in npm test): actual default loopback bind, absent/present Origin policy, canonical Host/duplicate headers/aliases, request targets, no CORS, health, initialize, ten tools and synthetic-CDP status. No real account or Tunnel credential. Old malicious-origin initialize returned 200; the fixed server returns 403.
- Windows test-process-ownership.ps1: refuses altered identity, stops only its disposable owned Node process, preserves a second disposable Node process.
- npm run test:mcp: local initialize, tool inventory and valid status schema. Browser unavailable is a reported status, not an end-to-end pass; output is deliberately reduced to connection state and page kind.
- GitHub Actions: Node 22/24, npm ci --ignore-scripts, syntax, offline tests; no browser, tunnel, key or live status probe. Actual hosted CI runs require a future repository and are not proven by local tests.

The independent reviewer checks only publication-impacting issues. Existing business sources remain unchanged; no new Xiaohongshu actions, OCR, cloud crawling or login automation were introduced. A GUI launcher and secure local credential storage remain planned for v0.3.

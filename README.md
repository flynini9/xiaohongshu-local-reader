[简体中文](README.md) | [English](README_EN.md)

# 小红书本地阅读器 / Xiaohongshu Local Reader MCP

**v0.2.0 — First Public Release**  
**作者：flynini9 & Zhi**

> 💬 **普通 ChatGPT 对话就能直接刷小红书：无需 Work，也无需 Codex。**  
> 连接好 MCP 后，可以直接在普通 Chat 中让 AI 搜索、打开并阅读你已登录浏览器里的小红书公开内容。

这是一个**本地优先、只读**的小红书 MCP。它让 ChatGPT / 其他兼容 MCP 的客户端，通过用户自己手动登录的 Chrome / Chromium / Edge 读取公开页面、搜索结果和笔记内容。

内容来自浏览器当前可见的 DOM / meta，无需 VPS 或云端爬虫；不读取 Cookie、localStorage、sessionStorage，不自动登录，也不读取私信正文。

> ChatGPT 已完成真实链路验收。其他支持 MCP 的客户端在协议层面理论兼容，但尚未逐一验证。

## 架构

```text
MCP Client
    ↓ Secure MCP Tunnel（本地客户端可不使用）
Local MCP Server — http://127.0.0.1:3333/mcp
    ↓ Chrome DevTools Protocol (CDP)
Dedicated Chrome/Chromium/Edge — http://127.0.0.1:9222
    ↓
Manually logged-in Xiaohongshu Web
```

本地 MCP 客户端可直接连接本机 HTTP 端点；远程 ChatGPT 场景可使用 Secure MCP Tunnel。登录始终由用户自己在浏览器中完成。

更详细的设计说明见 [docs/architecture.md](docs/architecture.md)。

## 功能

| Tool | 当前能力 |
| --- | --- |
| `xiaohongshu_status` | 检查 CDP 连通性、已打开的小红书页面和谨慎的页面级登录提示 |
| `xiaohongshu_current_page` | 根据 URL / DOM 分类并读取当前小红书页面 |
| `xiaohongshu_search` | 搜索并等待结果稳定，返回标题、作者、点赞数、图片和完整链接 |
| `xiaohongshu_get_note` | 通过完整 URL 或安全解析的 noteId 读取公开笔记 |
| `xiaohongshu_feed` | 读取当前已渲染的 Feed 卡片，不主动滚动 |
| `xiaohongshu_get_comments` | 读取当前笔记 DOM 中已经可见的评论，默认 20、最多 50 条，不展开、不提交 |
| `xiaohongshu_close_overlay` | 尝试关闭经 DOM 验证的笔记浮层，并返回验证结果 |
| `xiaohongshu_go_home` | 返回小红书首页 |
| `xiaohongshu_back` | 浏览器历史后退一次 |
| `xiaohongshu_load_more` | 最多滚动 3 次，最多返回 20 条新增卡片 |

### noteId 与真实链接

`noteId` 会按顺序复用：

1. Feed / Search 当前 DOM 中真实可见的完整链接；
2. 已打开详情页里的带 token URL；
3. 最多保留 10 分钟的短期内存 URL cache（最多 200 条）。

找不到真实可复用链接时返回 `TOKENIZED_URL_NOT_FOUND`。

本项目不会：

- 构造裸 `/explore/<noteId>`；
- 生成或伪造 `xsec_token`；
- 删除用户显式传入 URL 中原本存在的查询参数。

### 图片与长正文

正文图片返回：

- `images`：最多 30 张；
- `imageCount`：图片数量；
- `image`：第一张正文图，满足 `image === images[0] ?? null`。

只从当前笔记媒体 / 轮播容器提取，并过滤头像、评论图、logo、icon、emoji、推荐图和视频 poster；重复 slide 会去重。

长正文最多保留 12000 字符，不受短字段 500 字符上限影响。正文优先使用 DOM；当 meta description 与正文兼容且明显更完整时会择优。返回的 `textSource` 为 `dom`、`meta_description` 或 `null`。

明确的只读 `Runtime.evaluate` timeout 最多自动重试一次；导航和鼠标操作不会因此重复执行。

## 安全与隐私

本项目的默认边界：

- 不读取 Cookie、localStorage 或 sessionStorage。
- 不请求密码、登录凭据或验证码。
- 不绕过登录、CAPTCHA、风控、反滥用限制或受限页面。
- 不执行点赞、收藏、关注、评论、发布、私信、支付、资料修改或其他账号写操作。
- 不读取私信正文：可以识别“聊天页 / 私信页”这一页面类型，但正文内容会被刻意跳过。
- 登录完全由用户手动完成。
- CDP 和 MCP 默认仅监听 loopback，本地浏览器调试端口不会直接暴露到网络。

这里的“只读”指**不执行账号写操作**。搜索、导航、滚动仍会改变你本机浏览器当前显示的页面。

DOM 是不可信输入，客户端不应把网页正文里的指令当成系统指令执行。

正文、作者、真实完整 URL / `xsec_token` 可能作为 MCP 结果返回给客户端；使用 Tunnel 时这些结果也会通过 Tunnel 转发。请不要把实际会话结果或运行日志提交到公开仓库。

### Transport policy

MCP 默认只监听 `127.0.0.1`。

任意带 `Origin` 的请求都会返回 `403 Forbidden`，包括空 Origin、`null` 和本机网页请求。正常的本地 MCP / Tunnel 客户端通常不带 Origin，因此可正常访问。

服务不返回 CORS 授权 header，也不接受网页直接跨域调用。

Host 必须匹配当前实际监听端口上的：

- `127.0.0.1:<port>`
- `localhost:<port>`

缺失、重复、异常 Host、错误端口、IPv4 数字别名和尾点都会被拒绝。该策略同样保护 `/healthz` 和 `/readyz`。

远程连接请通过 Tunnel，不要把本地 MCP 端口直接暴露公网。

`HOST` 环境变量仍允许显式更改监听接口，但**非 loopback 绑定会把服务暴露给 LAN / 公网，强烈不建议**。Host / Origin 防护不是远程身份认证机制。

可选的 `XHS_READER_TOKEN` 可启用 Bearer / `X-Local-Reader-Token` 请求认证。客户端或 Tunnel 必须同步配置请求头。

本项目不声称能够抵御恶意本地进程。

v0.2.0 已完成真实 Secure MCP Tunnel、公共 start / stop BAT 和普通 ChatGPT 对话链路验收。

## 环境要求

- Node.js **22.4+**，建议使用仍在维护的 Node 22 或 24。
- Chrome / Chromium 或 Edge。
- 浏览器需启用 CDP（Chrome DevTools Protocol，浏览器调试接口），推荐使用独立 profile。
- MCP 客户端需支持 Streamable HTTP。
- 当前实现使用 `2025-03-26` MCP 协议和 JSON 响应，不提供持续 SSE stream。
- 如需远程 ChatGPT 连接，可选 Secure MCP Tunnel；用户需自行取得 tunnel-client、Tunnel ID、运行凭据和对应权限。
- Windows 公共 BAT 需要 Windows PowerShell 5.1+。
- 其他系统可直接运行 `npm start`，并自行准备 CDP 浏览器。

运行时没有第三方 npm dependencies。

## 安装

可以直接克隆公开仓库：

```sh
git clone https://github.com/flynini9/xiaohongshu-local-reader.git xiaohongshu-local-reader
cd xiaohongshu-local-reader
npm install
npm run check
npm test
```

也可以直接下载源码压缩包，解压后在项目目录运行相同 npm 命令。

## Windows 快速开始

### 1. 启动专用 CDP 浏览器

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-browser.ps1
```

脚本会使用独立浏览器 profile。打开后，请在这个窗口里**手动登录小红书**。

已有自己的专用 CDP 浏览器时也可以跳过该脚本，并通过 `CDP_ENDPOINT` 指向现有端点。

手动启动 Chrome 的替代方式：

```powershell
& $env:XHS_CHROME_PATH --remote-debugging-port=9222 "--user-data-dir=$env:LOCALAPPDATA\xiaohongshu-local-reader-profile" --no-first-run https://www.xiaohongshu.com/
```

### 2. 配置并启动 Tunnel + MCP

Secure MCP Tunnel 的安装与权限说明请参考 OpenAI 官方文档。

下面只是模板。**不要把真实 API key 写入脚本、聊天或 Git。**

```powershell
$env:CONTROL_PLANE_API_KEY = ''YOUR_API_KEY''
$env:XHS_TUNNEL_PROFILE = ''YOUR_PROFILE_NAME''

# tunnel-client 不在 PATH 时，配置实际路径：
$env:XHS_TUNNEL_CLIENT = (Resolve-Path .\tools\tunnel-client.exe).Path

& $env:XHS_TUNNEL_CLIENT init --profile $env:XHS_TUNNEL_PROFILE --tunnel-id YOUR_TUNNEL_ID --mcp-server-url http://127.0.0.1:3333/mcp

.\scripts\windows\start-xhs-reader.bat
```

`tools/` 只是示例目录，本仓库不会捆绑 tunnel-client 二进制。

Profile 保存在仓库之外；key 通过 `env:CONTROL_PLANE_API_KEY` 引用。不要提交生成的 profile。

| 环境变量 | 用途 |
| --- | --- |
| `CONTROL_PLANE_API_KEY` | 必填，当前进程环境中的 Tunnel 运行凭据 |
| `XHS_TUNNEL_PROFILE` | 必填，已初始化的 Tunnel profile |
| `XHS_TUNNEL_CLIENT` | 可选，tunnel-client.exe 路径；未设置时从 PATH 查找 |
| `PORT` | 可选，默认 3333；修改后需同步更新 Tunnel profile |
| `CDP_ENDPOINT` | 可选，默认 `http://127.0.0.1:9222`，仅接受 loopback HTTP |
| `XHS_READER_TOKEN` | 可选，MCP 请求认证 token；客户端 / Tunnel 需同步配置请求头 |

启动脚本会：

- 强制 MCP 使用 loopback；
- 检查端口、CDP 和 MCP health；
- 隐藏启动 MCP 和 Tunnel；
- 把日志与进程状态只写入已被 gitignore 忽略的 `.xhs-reader/`；
- 如果目标端口已经被其他进程占用，会直接报错，不会杀掉陌生进程；
- 失败时执行回滚。

Tunnel 进程启动不代表连接一定 ready。可使用本地 admin UI 或：

```powershell
tunnel-client doctor --profile YOUR_PROFILE_NAME --explain
```

确认状态。

停止：

```powershell
.\scripts\windows\stop-xhs-reader.bat
```

停止脚本只会结束身份与本项目记录一致的 MCP / Tunnel 进程，不会按端口、进程名或窗口标题批量 kill。

**公共 BAT 不管理浏览器生命周期。** stop 后浏览器会继续保留，用户自己关闭。

### 3. 仅运行本地 MCP

不使用 Tunnel 时：

```powershell
$env:CDP_ENDPOINT = ''http://127.0.0.1:9222''
npm start
```

也可以运行 `scripts/start-local.ps1`，前台使用 Ctrl+C 停止。

客户端连接：

```text
http://127.0.0.1:3333/mcp
```

仓库中的 `.mcp.json` / `mcp.json` 是本地连接模板。

## 使用示例

以下为独立的 `tools/call` 参数示例：

```jsonl
{"name":"xiaohongshu_status","arguments":{}}
{"name":"xiaohongshu_search","arguments":{"keyword":"城市散步"}}
{"name":"xiaohongshu_current_page","arguments":{}}
{"name":"xiaohongshu_get_note","arguments":{"noteId":"NOTE_ID_FROM_FEED_OR_SEARCH"}}
```

优先从 Feed / Search 获取真实完整 `url`，原样作为 `arguments.url` 传入，不要自己重建 token。

建议客户端在总结前先检查：

- `pageKind`
- `warnings`
- `errorCode`

## 测试

```sh
node --check scripts/server.mjs
node --check scripts/lib/browser-dom.mjs
npm run check
npm test
npm run test:transport
```

离线测试覆盖：

- 页面分类；
- URL / cache；
- 媒体提取；
- 长正文；
- snapshot timeout 重试；
- 私信 DOM 边界；
- transport security；
- Host / Origin 防护；
- health；
- initialize；
- 十个 MCP tools；
- status。

这些测试无需外网、真实登录、Tunnel 或 key。

Windows 进程身份隔离测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-process-ownership.ps1
```

针对已经运行的 MCP：

```powershell
$env:MCP_BASE_URL = ''http://127.0.0.1:3333''
npm run test:mcp
```

该测试会验证初始化、十个工具和 status，不输出页面标题、账号信息或 token。

CI（自动跑测试的流程）会在 Node 22 / 24 上运行 `npm ci --ignore-scripts`、语法检查和离线测试；不会启动 Chrome、连接 Tunnel、使用 key 或运行 `test:mcp`。

## 已知限制

- 暂不支持 OCR。
- 暂不支持视频识别、完整视频提取或视频播放。
- 不读取私信正文。
- 只读取 DOM / meta 已暴露的内容；尚未渲染的图片、评论或隐藏正文不会被自动补全。
- 小红书 DOM 变化可能需要更新选择器。
- 媒体过滤规则无法保证适配未来所有页面结构。
- `xsec_token` 只复用真实链接，可能过期，从不生成。
- 当前会选择 CDP 页面列表中的第一个小红书 tab，不一定是用户前台正在看的那个 tab。
- 关闭浮层是尽力操作，直接导航到详情页时可能不存在可关闭浮层。
- 登录状态只根据页面线索谨慎推断。
- 公共 BAT 不管理浏览器生命周期。
- v0.2.0 没有 GUI、系统级凭据存储或持续健康监控。

## 仓库与许可

公共代码位于：

- `scripts/`
- `skills/`
- `docs/`
- `.github/`

插件 metadata：

- `plugin.json`
- `.codex-plugin/plugin.json`

`config/mcp.remote.example.json` 是远程 HTTPS 配置模板，不代表可以直接公网部署。

以下内容不会作为发布文件：

- 本机旧中文 BAT；
- `*.local.bat`；
- `.env`；
- Tunnel profiles；
- 日志；
- 测试临时输出；
- `.xhs-reader/`；
- 用户自行下载的 `.exe`。

本项目采用 **MIT License**，完整条款见 [LICENSE](LICENSE)。

公开仓库：`flynini9/xiaohongshu-local-reader`

发布清单见 [docs/release-checklist.md](docs/release-checklist.md)。

## 路线图

### v0.3 — Windows GUI Launcher（计划中）

计划加入：

- GUI 一键启停；
- 服务状态；
- 健康检查；
- 本地日志查看；
- 安全的本地凭据存储。

这些 GUI / 凭据存储能力目前尚未实现。

视频笔记支持也计划在后续版本继续探索。

---

Made by **flynini9 & Zhi**.


import http from "node:http";
import { randomUUID } from "node:crypto";
import { classifyPage } from "./lib/page-state.mjs";
import { capturePage, captureComments, findControl } from "./lib/browser-dom.mjs";
import { extractNoteMedia } from "./lib/note-media.mjs";
import { findTokenizedNoteUrl, NoteUrlCache, tokenizedNoteUrl } from "./lib/note-url.mjs";
import { chooseNoteText } from "./lib/note-text.mjs";
import { retrySnapshotEvaluate } from "./lib/retry-snapshot.mjs";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3333);
const CDP_ENDPOINT = (process.env.CDP_ENDPOINT || "http://127.0.0.1:9222").replace(/\/$/, "");
const PAGE_TIMEOUT_MS = Math.min(Math.max(Number(process.env.XHS_PAGE_TIMEOUT_MS || 8000), 1000), 15000);
const MAX_BODY_BYTES = 512 * 1024;
const MCP_PROTOCOL_VERSION = "2025-03-26";
const READER_TOKEN = process.env.XHS_READER_TOKEN || "";
const noteUrlCache = new NoteUrlCache();

const SERVER_INSTRUCTIONS =
  "这是一个只读的小红书本地浏览器桥接。先用 xiaohongshu_status 检查本机浏览器和登录态；需要读取时只使用用户已登录浏览器中可见的页面。不要索取、输出或推断 Cookie、localStorage、验证码或登录凭据，也不要绕过登录、验证码、风控或访问限制。";

const TOOLS = [
  {
    name: "xiaohongshu_status",
    title: "检查小红书本地连接",
    description: "检查本机 CDP 浏览器连接、已打开的小红书页面和一个谨慎的登录状态提示。不会读取 Cookie 或浏览器存储。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "xiaohongshu_current_page",
    title: "读取当前小红书页面",
    description: "按实际 URL 和可见 DOM 识别并结构化读取当前页面；聊天页仅返回安全概要。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "xiaohongshu_search",
    title: "搜索小红书",
    description: "打开小红书搜索并等待可见卡片稳定，返回带完整原始链接的结构化结果。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "要搜索的关键词，最多 100 个字符。" },
      },
      required: ["keyword"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "xiaohongshu_get_note",
    title: "读取小红书笔记",
    description: "读取笔记；url 保留完整查询参数，noteId 只复用当前 DOM 或短期内存中已有的真实完整笔记链接，找不到时不导航。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "小红书笔记的 HTTPS URL。" },
        noteId: { type: "string", description: "小红书笔记 ID；提供 url 时不要重复提供。" },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  ...[
    ["xiaohongshu_feed", "读取当前 Feed", "读取当前已渲染的公开笔记卡片，不滚动。"],
    ["xiaohongshu_get_comments", "读取可见评论", "只读取当前页面 DOM 已公开可见的评论，不展开或提交。"],
    ["xiaohongshu_close_overlay", "关闭笔记浮层", "通过 DOM 定位安全关闭按钮或遮罩并使用 CDP 鼠标关闭。"],
    ["xiaohongshu_go_home", "返回首页", "优先点击首页导航，必要时直接导航至首页。"],
    ["xiaohongshu_back", "浏览器后退", "使用 CDP 导航历史后退一次。"],
    ["xiaohongshu_load_more", "少量加载卡片", "最多滚动三次并读取最多二十条新增可见卡片。"],
  ].map(([name, title, description]) => ({
    name, title, description,
    inputSchema: name === "xiaohongshu_get_comments"
      ? { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false }
      : name === "xiaohongshu_load_more"
        ? { type: "object", properties: { maxScrolls: { type: "integer", minimum: 1, maximum: 3 }, maxItems: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false }
        : { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  })),
];

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (!message.id || !this.pending.has(message.id)) return;
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || "CDP error"));
        else pending.resolve(message.result);
      } catch {
        // Ignore non-JSON browser messages.
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Browser CDP connection closed")); }
      this.pending.clear();
    });
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to browser CDP")), 4000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to browser CDP"));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser CDP timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  close() {
    try { this.socket.close(); } catch { /* already closed */ }
  }
}

async function listBrowserTargets() {
  const response = await fetch(`${CDP_ENDPOINT}/json/list`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Browser CDP returned HTTP ${response.status}`);
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

function isXiaohongshuUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)xiaohongshu\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function selectPageTarget(targets, { requireXhs = false } = {}) {
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const xhsPage = pages.find((target) => isXiaohongshuUrl(target.url || ""));
  if (requireXhs && !xhsPage) {
    throw new Error("没有找到已打开的小红书页面。请在同一浏览器中打开 https://www.xiaohongshu.com/ 并完成登录（如需要）。");
  }
  const target = xhsPage || pages[0];
  if (!target) {
    throw new Error(`没有找到可用的浏览器页面。请启动带 CDP 的 Chrome/Edge，端口应为 ${new URL(CDP_ENDPOINT).port || 9222}。`);
  }
  return target;
}

async function withBrowserPage(callback, options = {}) {
  const targets = await listBrowserTargets();
  const target = selectPageTarget(targets, options);
  const cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    return await callback(cdp, target);
  } finally {
    cdp.close();
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result?.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser page evaluation failed");
  }
  return result?.result?.value;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot(cdp, maxItems = 40) {
  const page = await retrySnapshotEvaluate(
    () => evaluate(cdp, `(${capturePage.toString()})(${maxItems})`),
  );
  const state = { ...page, ...classifyPage(page) };
  if (["home_feed", "search_results"].includes(state.pageKind)) noteUrlCache.remember(state.cards);
  if (state.note) {
    const { mediaCandidates, ...note } = state.note;
    state.note = state.pageKind === "note_page"
      ? { ...note, ...chooseNoteText(note.text, note.metadata?.description), ...extractNoteMedia(mediaCandidates) }
      : note;
  }
  return state;
}

async function waitForState(cdp, expected, timeoutMs = PAGE_TIMEOUT_MS) {
  const started = Date.now();
  const deadline = Date.now() + timeoutMs;
  let prior = "";
  let stable = 0;
  let page;
  do {
    page = await snapshot(cdp, expected === "note_page" ? 0 : 40);
    if (["network_error", "access_limited", "login_page", "not_found"].includes(page.pageKind)) return { page, timedOut: false };
    const signature = `${page.url}|${page.pageKind}|${page.cards.length}|${page.note?.title || ""}|${page.note?.text?.length || 0}`;
    stable = signature === prior ? stable + 1 : 0;
    prior = signature;
    const ready = page.pageKind === expected && (expected === "search_results" || expected === "home_feed" ? page.cards.length > 0 : expected === "note_page" ? Boolean(page.note?.title || page.note?.text) : true);
    const minimumMs = expected === "search_results" ? 2000 : 700;
    if (ready && stable >= 3 && Date.now() - started >= minimumMs) return { page, timedOut: false };
    await delay(expected === "note_page" ? 500 : 350);
  } while (Date.now() < deadline);
  return { page, timedOut: true };
}

async function navigateAndRead(cdp, url, expected) {
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url });
  if (expected === "note_page") await delay(250);
  return waitForState(cdp, expected);
}

function assertKeyword(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("keyword 必须是非空字符串。");
  const keyword = value.trim();
  if (keyword.length > 100) throw new Error("keyword 最多 100 个字符。");
  return keyword;
}

function assertNoteUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("请提供 url 或 noteId。");
  const url = new URL(value.trim());
  if (!isXiaohongshuUrl(url.href)) {
    throw new Error("出于安全原因，只允许访问 https://*.xiaohongshu.com/ 的页面。");
  }
  return value.trim(); // Preserve the full user-provided tokenized URL and query string.
}

function assertNoteId(value) {
  const noteId = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(noteId)) throw new Error("noteId 必须是 1 到 200 位的笔记 ID。");
  return noteId;
}

async function findExistingNoteUrl(noteId) {
  const targets = (await listBrowserTargets())
    .filter((target) => target.type === "page" && target.webSocketDebuggerUrl && isXiaohongshuUrl(target.url || ""))
    .slice(0, 5);
  let currentPage = null;
  let openNote = null;
  for (const target of targets) {
    const cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      const page = await snapshot(cdp, 100);
      currentPage ||= page;
      if (page.pageKind === "note_page" && tokenizedNoteUrl(noteId, page.url)) {
        openNote ||= { url: page.url, target, currentPage: page, alreadyOpen: true };
      }
      if (!["home_feed", "search_results"].includes(page.pageKind)) continue;
      const url = findTokenizedNoteUrl(noteId, page.cards);
      if (url) return { url, target, currentPage: page };
    } finally {
      cdp.close();
    }
  }
  if (openNote) return openNote;
  return { url: noteUrlCache.get(noteId), target: targets[0] || null, currentPage };
}

function formatPage(page, { keyword, timedOut = false } = {}) {
  const warnings = [];
  if (timedOut) warnings.push("等待页面内容稳定超时；返回当前已渲染内容。");
  if (page.pageKind === "access_limited") warnings.push("页面限制访问，未读取笔记内容。");
  if (page.pageKind === "network_error") warnings.push("浏览器显示网络错误页。");
  const result = {
    kind: page.pageKind, source: page.url, pageKind: page.pageKind,
    loginState: page.loginState, itemCount: 0, truncated: false,
    warnings, errorCode: page.errorCode || null,
  };
  if (page.pageKind === "search_results") {
    result.keyword = keyword ?? new URL(page.url).searchParams.get("keyword") ?? "";
    result.results = page.cards;
    result.itemCount = page.cards.length;
    result.truncated = page.cardsTruncated;
    if (!result.itemCount) {
      warnings.push("未找到可见搜索卡片；页面选择器可能变化或结果尚未加载。");
      result.visibleText = page.signalText.slice(0, 1200);
    }
  } else if (page.pageKind === "home_feed") {
    result.kind = "feed";
    result.items = page.cards;
    result.itemCount = page.cards.length;
    result.truncated = page.cardsTruncated;
    if (!result.itemCount) {
      warnings.push("未找到可见 Feed 卡片；页面选择器可能变化或内容尚未加载。");
      result.visibleText = page.signalText.slice(0, 1200);
    }
  } else if (page.pageKind === "note_page") {
    Object.assign(result, page.note || {});
    if (!page.note?.title && !page.note?.text) {
      warnings.push("未找到可靠的笔记内容选择器。");
      result.visibleText = page.signalText.slice(0, 1200);
    }
  } else if (["profile_page", "notification_page", "chat_page"].includes(page.pageKind)) {
    result.title = page.title;
    result.summary = page.pageKind === "chat_page" ? "聊天页面；不读取私信内容。" : "仅提供页面标题概要。";
  } else if (page.pageKind === "login_page") {
    result.summary = "页面需要手动登录。";
  } else if (page.pageKind === "unknown") {
    warnings.push("页面类型无法可靠识别；仅返回截断的可见文本。");
    result.visibleText = page.signalText.slice(0, 1200);
  }
  return result;
}

async function mouseClick(cdp, point) {
  for (const [type, extra] of [["mouseMoved", {}], ["mousePressed", { button: "left", clickCount: 1 }], ["mouseReleased", { button: "left", clickCount: 1 }]]) {
    await cdp.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, ...extra });
  }
}

async function callTool(name, args = {}) {
  if (name === "xiaohongshu_status") {
    try {
      const targets = await listBrowserTargets();
      const pages = targets.filter((target) => target.type === "page");
      const xhsPages = pages.filter((target) => isXiaohongshuUrl(target.url || ""));
      let page = null;
      if (xhsPages.length > 0) {
        page = await withBrowserPage(async (cdp) => snapshot(cdp, 0), { requireXhs: true });
      }
      return {
        kind: "status",
        source: page ? new URL(page.url).origin + new URL(page.url).pathname : null,
        pageKind: page?.pageKind || "unknown",
        itemCount: 0,
        truncated: false,
        warnings: [],
        errorCode: page?.errorCode || null,
        browserConnected: true,
        cdpEndpoint: CDP_ENDPOINT,
        openPages: pages.length,
        xiaohongshuPages: xhsPages.map((target) => ({ title: target.title || "", url: new URL(target.url).origin + new URL(target.url).pathname })),
        loginState: page?.loginState || "unknown",
        note: "登录状态仅根据页面可见元素谨慎推断，不读取 Cookie、localStorage 或 sessionStorage。",
      };
    } catch (error) {
      return {
        kind: "status", source: null, pageKind: "unknown", itemCount: 0, truncated: false,
        warnings: [error.message], errorCode: null,
        browserConnected: false,
        cdpEndpoint: CDP_ENDPOINT,
        loginState: "unknown",
        error: error.message,
        nextStep: "请运行 scripts/start-browser.ps1，或把 CDP_ENDPOINT 指向你现有的 Codexless/Chrome 调试端点。",
      };
    }
  }

  if (name === "xiaohongshu_current_page") {
    return withBrowserPage(async (cdp, target) => {
      if (!isXiaohongshuUrl(target.url || "")) {
        throw new Error("当前浏览器页面不是小红书页面。请先打开一个小红书页面，或使用 xiaohongshu_search / xiaohongshu_get_note。");
      }
      return formatPage(await snapshot(cdp));
    }, { requireXhs: true });
  }

  if (name === "xiaohongshu_search") {
    const keyword = assertKeyword(args.keyword);
    const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`;
    return withBrowserPage(async (cdp) => {
      const state = await navigateAndRead(cdp, url, "search_results");
      return formatPage(state.page, { keyword, timedOut: state.timedOut });
    });
  }

  if (name === "xiaohongshu_get_note") {
    if (args.url && args.noteId) throw new Error("url 和 noteId 只能提供一个。");
    if (args.url) {
      const url = assertNoteUrl(args.url);
      return withBrowserPage(async (cdp) => {
        const state = await navigateAndRead(cdp, url, "note_page");
        return formatPage(state.page, { timedOut: state.timedOut });
      });
    }
    const noteId = assertNoteId(args.noteId);
    const found = await findExistingNoteUrl(noteId);
    if (!found.url || !found.target) {
      return {
        kind: "note_lookup", source: null, pageKind: found.currentPage?.pageKind || "unknown",
        loginState: found.currentPage?.loginState || "unknown", itemCount: 0, truncated: false,
        warnings: ["未在当前 Feed/Search DOM 或最近的读取结果中找到该笔记的真实完整链接。请传入 Feed/Search 返回的完整 URL，或先执行 Feed/Search 获取该笔记；未打开裸 /explore/ 地址。"],
        errorCode: "TOKENIZED_URL_NOT_FOUND", noteId,
      };
    }
    if (found.alreadyOpen) return formatPage(found.currentPage);
    const cdp = await CdpClient.connect(found.target.webSocketDebuggerUrl);
    try {
      const state = await navigateAndRead(cdp, found.url, "note_page");
      return formatPage(state.page, { timedOut: state.timedOut });
    } finally {
      cdp.close();
    }
  }

  if (name === "xiaohongshu_feed") {
    return withBrowserPage(async (cdp) => {
      const page = await snapshot(cdp);
      const result = formatPage(page);
      if (page.pageKind !== "home_feed") result.warnings.push("当前页面不是首页 Feed。");
      return result;
    }, { requireXhs: true });
  }

  if (name === "xiaohongshu_get_comments") {
    const limit = args.limit === undefined ? 20 : args.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("limit 必须是 1 到 50 的整数。");
    return withBrowserPage(async (cdp) => {
      const page = await snapshot(cdp, 0);
      const base = formatPage(page);
      const warnings = [...base.warnings];
      if (page.pageKind !== "note_page") return { ...base, kind: "comments", comments: [], warnings: [...warnings, "当前页面不是可读取的笔记页。"] };
      const found = await evaluate(cdp, `(${captureComments.toString()})(${limit})`);
      if (!found.selectorFound) warnings.push("未找到评论列表选择器。");
      if (found.selectorFound && !found.comments.length) warnings.push("当前 DOM 没有可解析的公开可见评论。");
      return { ...base, kind: "comments", comments: found.comments, itemCount: found.comments.length, truncated: found.totalVisible > limit, warnings };
    }, { requireXhs: true });
  }

  if (name === "xiaohongshu_close_overlay") {
    return withBrowserPage(async (cdp) => {
      const before = await snapshot(cdp, 0);
      const warnings = [];
      if (!before.hasDetail) return { kind: "overlay_close", method: null, closed: false, pageKind: before.pageKind, warnings: ["未检测到笔记详情浮层。"] };
      let method = "close_button";
      let point = await evaluate(cdp, `(${findControl.toString()})("close")`);
      if (!point) {
        method = "safe_backdrop";
        point = await evaluate(cdp, `(${findControl.toString()})("backdrop")`);
      }
      if (!point) return { kind: "overlay_close", method: null, closed: false, pageKind: before.pageKind, warnings: ["找不到可验证的关闭按钮或安全遮罩空白点；未点击。"] };
      await mouseClick(cdp, point);
      let after = await snapshot(cdp, 0);
      for (let i = 0; i < 6 && after.hasDetail && after.url === before.url; i++) { await delay(250); after = await snapshot(cdp, 0); }
      const closed = !after.hasDetail || after.url !== before.url;
      if (!closed) warnings.push("点击后未验证到浮层消失或页面变化。");
      return { kind: "overlay_close", method, closed, pageKind: after.pageKind, warnings };
    }, { requireXhs: true });
  }

  if (name === "xiaohongshu_go_home") {
    return withBrowserPage(async (cdp) => {
      const point = await evaluate(cdp, `(${findControl.toString()})("home")`);
      let navigationMethod = point ? "ui_click" : "direct";
      const warnings = [];
      if (point) await mouseClick(cdp, point);
      else { await cdp.send("Page.enable"); await cdp.send("Page.navigate", { url: "https://www.xiaohongshu.com/" }); }
      let state = await waitForState(cdp, "home_feed", point ? 2500 : PAGE_TIMEOUT_MS);
      if (point && state.page.pageKind !== "home_feed") {
        warnings.push("首页导航点击后未确认到首页，已改用直接导航。");
        navigationMethod = "direct";
        await cdp.send("Page.enable");
        await cdp.send("Page.navigate", { url: "https://www.xiaohongshu.com/" });
        state = await waitForState(cdp, "home_feed");
      }
      const result = formatPage(state.page, { timedOut: state.timedOut });
      result.navigationMethod = navigationMethod;
      result.warnings.push(...warnings);
      if (result.pageKind !== "home_feed") result.warnings.push("导航后未确认到首页 Feed。");
      return result;
    });
  }

  if (name === "xiaohongshu_back") {
    return withBrowserPage(async (cdp) => {
      const before = await snapshot(cdp, 0);
      const history = await cdp.send("Page.getNavigationHistory");
      if (history.currentIndex < 1) return { kind: "navigation_back", source: before.url, beforeUrl: before.url, beforePageKind: before.pageKind, pageKind: before.pageKind, warnings: ["没有可后退的历史记录。"] };
      await cdp.send("Page.navigateToHistoryEntry", { entryId: history.entries[history.currentIndex - 1].id });
      const deadline = Date.now() + PAGE_TIMEOUT_MS;
      let after = await snapshot(cdp, 0);
      while (after.url === before.url && Date.now() < deadline) { await delay(300); after = await snapshot(cdp, 0); }
      if (after.url !== before.url) { await delay(500); after = await snapshot(cdp, 0); }
      return { kind: "navigation_back", source: after.url, beforeUrl: before.url, beforePageKind: before.pageKind, pageKind: after.pageKind, loginState: after.loginState, itemCount: 0, truncated: false, warnings: after.url === before.url ? ["后退后 URL 未变化，无法确认导航成功。"] : [], errorCode: after.errorCode };
    }, { requireXhs: true });
  }

  if (name === "xiaohongshu_load_more") {
    const maxScrolls = args.maxScrolls === undefined ? 2 : args.maxScrolls;
    const maxItems = args.maxItems === undefined ? 20 : args.maxItems;
    if (!Number.isInteger(maxScrolls) || maxScrolls < 1 || maxScrolls > 3 || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 20) throw new Error("maxScrolls 必须为 1-3，maxItems 必须为 1-20。");
    return withBrowserPage(async (cdp) => {
      const before = await snapshot(cdp, 60);
      if (!["home_feed", "search_results"].includes(before.pageKind)) return { kind: "load_more", source: before.url, pageKind: before.pageKind, addedCount: 0, itemCount: 0, truncated: false, warnings: ["当前页面不是 Feed 或搜索结果；未滚动。"] };
      const existing = new Set(before.cards.map((card) => card.noteId));
      let after = before;
      for (let i = 0; i < maxScrolls; i++) {
        await evaluate(cdp, 'window.scrollBy(0, Math.min(window.innerHeight * 0.8, 800))');
        await delay(450);
        after = await snapshot(cdp, 60);
        if (after.pageKind !== before.pageKind) break;
      }
      const added = after.cards.filter((card) => !existing.has(card.noteId)).slice(0, maxItems);
      return { kind: "load_more", source: after.url, pageKind: after.pageKind, loginState: after.loginState, items: added, addedCount: added.length, itemCount: after.cards.length, truncated: after.cardsTruncated || after.cards.length - existing.size > maxItems, warnings: after.pageKind !== before.pageKind ? ["滚动期间页面状态变化。"] : [] };
    }, { requireXhs: true });
  }

  throw new Error(`未知工具：${name}`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mcpHeaders(sessionId) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  return headers;
}

function sendJson(res, statusCode, payload, sessionId) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { ...mcpHeaders(sessionId), "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function authorized(req) {
  if (!READER_TOKEN) return true;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const supplied = bearer || req.headers["x-local-reader-token"];
  return supplied === READER_TOKEN;
}

async function readRequestBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleMcp(req, res) {
  if (!authorized(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, mcpHeaders());
    res.end();
    return;
  }
  if (req.method === "DELETE") {
    res.writeHead(204, mcpHeaders(req.headers["mcp-session-id"]));
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { ...mcpHeaders(), Allow: "POST, DELETE, OPTIONS" });
    res.end();
    return;
  }

  let message;
  try {
    message = JSON.parse(await readRequestBody(req));
  } catch (error) {
    sendJson(res, 400, jsonRpcError(null, -32700, `Invalid JSON: ${error.message}`));
    return;
  }
  if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    sendJson(res, 400, jsonRpcError(message?.id ?? null, -32600, "Invalid JSON-RPC request"));
    return;
  }

  const id = message.id;
  if (id === undefined && (message.method === "notifications/initialized" || message.method.startsWith("notifications/"))) {
    res.writeHead(202, mcpHeaders(req.headers["mcp-session-id"]));
    res.end();
    return;
  }

  let result;
  let responseError;
  try {
    switch (message.method) {
      case "initialize":
        result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "xiaohongshu-local-reader", version: "0.2.0" },
          instructions: SERVER_INSTRUCTIONS,
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call":
        result = await callTool(message.params?.name, message.params?.arguments || {});
        result = {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
        break;
      case "resources/list":
        result = { resources: [] };
        break;
      case "prompts/list":
        result = { prompts: [] };
        break;
      default:
        responseError = jsonRpcError(id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    result = {
      isError: true,
      content: [{ type: "text", text: error.message || "Tool call failed" }],
    };
  }

  const sessionId = req.headers["mcp-session-id"] || (message.method === "initialize" ? randomUUID() : undefined);
  sendJson(res, 200, responseError || jsonRpcResult(id, result), sessionId);
}

function trustedLocalRequest(req) {
  // rawHeaders keeps duplicates that Node otherwise discards (notably Host).
  let hostCount = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase();
    if (name === "origin") return false; // Absent is allowed; empty/null is not.
    if (name === "host") hostCount++;
  }
  if (hostCount !== 1 || typeof req.headers.host !== "string") return false;
  const port = server.address().port;
  const names = ["127.0.0.1", "localhost"];
  if (server.address().address === "::1") names.push("[::1]");
  const allowed = names.map((name) => `${name}:${port}`);
  if (port === 80) allowed.push(...names); // Standard HTTP clients omit :80.
  // Strict authority match: never normalize numeric aliases, userinfo or ports.
  return allowed.includes(req.headers.host.toLowerCase());
}

const server = http.createServer(async (req, res) => {
  try {
    if (!trustedLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    // This is an origin server, not an HTTP proxy. Reject alternate authorities.
    if (!req.url?.startsWith("/") || req.url.startsWith("//") || req.url.includes("\\")) {
      sendJson(res, 400, { error: "Bad request target" });
      return;
    }
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/healthz") {
      sendJson(res, 200, { ok: true, service: "xiaohongshu-local-reader", cdpEndpoint: CDP_ENDPOINT });
      return;
    }
    if (requestUrl.pathname === "/readyz") {
      try {
        await listBrowserTargets();
        sendJson(res, 200, { ok: true, browser: "reachable" });
      } catch (error) {
        sendJson(res, 503, { ok: false, browser: "unreachable", error: error.message });
      }
      return;
    }
    if (requestUrl.pathname === "/mcp") {
      await handleMcp(req, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`xiaohongshu-local-reader listening on http://${HOST}:${PORT}`);
  console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`Browser CDP: ${CDP_ENDPOINT}`);
  console.log(READER_TOKEN ? "Optional request token: enabled" : "Optional request token: disabled (loopback/Tunnel mode)");
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

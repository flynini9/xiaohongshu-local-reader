export function classifyPage({ url = "", title = "", signalText = "" } = {}) {
  const value = `${title}\n${signalText}`;
  if (/^chrome-error:\/\/chromewebdata\//i.test(url) || /ERR_(?:CONNECTION_CLOSED|CONNECTION_RESET|INTERNET_DISCONNECTED|TIMED_OUT|NAME_NOT_RESOLVED)/i.test(value)) {
    return { pageKind: "network_error", errorCode: value.match(/ERR_[A-Z_]+/)?.[0] || "CHROME_ERROR" };
  }
  if (/error_code=300031|error_code%3D300031|当前笔记暂时无法浏览|请打开小红书App扫码查看/i.test(`${url}\n${value}`)) {
    return { pageKind: "access_limited", errorCode: /300031/.test(`${url}\n${value}`) ? "300031" : "ACCESS_LIMITED" };
  }
  if (/页面不存在|笔记不存在|404\s*not\s*found/i.test(value)) return { pageKind: "not_found", errorCode: "NOT_FOUND" };
  if (/验证码|安全验证|访问过于频繁|操作过于频繁|访问受限/i.test(value)) return { pageKind: "access_limited", errorCode: "ACCESS_LIMITED" };
  let parsed;
  try { parsed = new URL(url); } catch { return { pageKind: "unknown", errorCode: null }; }
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (/^\/(?:login|signin)(?:\/|$)/i.test(path) || (/^\/$/.test(path) && /登录后|扫码登录/.test(value))) return { pageKind: "login_page", errorCode: null };
  if (/^\/search_result\/[^/]+/i.test(path)) return { pageKind: "note_page", errorCode: null };
  if (/^\/search_result(?:\/|$)/i.test(path)) return { pageKind: "search_results", errorCode: null };
  if (/^\/chat(?:\/|$)/i.test(path)) return { pageKind: "chat_page", errorCode: null };
  if (path === "/explore") return { pageKind: "home_feed", errorCode: null };
  if (/^\/(?:explore|discovery\/item)\/[^/]+/i.test(path)) return { pageKind: "note_page", errorCode: null };
  if (/^\/user\/(?:profile|)[^/]*/i.test(path) && path !== "/user") return { pageKind: "profile_page", errorCode: null };
  if (/^\/(?:notification|notifications|message)(?:\/|$)/i.test(path)) return { pageKind: "notification_page", errorCode: null };
  if (path === "/" && /(^|\.)xiaohongshu\.com$/i.test(parsed.hostname)) return { pageKind: "home_feed", errorCode: null };
  return { pageKind: "unknown", errorCode: null };
}

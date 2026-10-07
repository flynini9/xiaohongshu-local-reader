// Functions in this file are serialized into Runtime.evaluate. Keep them self-contained.
export function capturePage(maxItems = 40) {
  const compact = (value, max = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const query = (root, selectors) => selectors.map((selector) => root?.querySelector(selector)).find((element) => visible(element));
  const attrText = (element) => compact(element?.innerText || element?.getAttribute("title") || element?.getAttribute("aria-label"));
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || "";
  const path = location.pathname;
  const privatePage = /^\/(?:chat|message|notification|notifications)(?:\/|$)/i.test(path);
  const signalText = privatePage ? "" : compact(document.body?.innerText, 6000);
  const loginDialog = query(document, ['[class*="login-modal"]', '[class*="login-container"]', '[class*="login-dialog"]']);
  const loginState = loginDialog || /扫码登录|登录后查看更多|立即登录/.test(signalText)
    ? "login_may_be_required"
    : query(document, ['nav a[href*="/user/profile"]', 'header a[href*="/user/profile"]', '[class*="side-bar"] a[href*="/user/profile"]']) ? "likely_logged_in" : "unknown";
  const links = [];
  const seen = new Set();
  for (const anchor of maxItems > 0 ? document.querySelectorAll('a[href*="/explore/"], a[href*="/search_result/"]') : []) {
    if (!visible(anchor)) continue;
    const url = anchor.href;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (parsed.protocol !== "https:" || !/(^|\.)xiaohongshu\.com$/i.test(parsed.hostname) || !/^\/(?:explore|search_result)\/[^/]+/.test(parsed.pathname)) continue;
    const noteId = parsed.pathname.split("/")[2] || "";
    if (seen.has(noteId)) continue;
    seen.add(noteId);
    const card = anchor.closest('.note-item, [class*="note-item"], [class*="note-card"], [class*="feed-card"]');
    const root = card && visible(card) ? card : anchor;
    const titleNode = query(root, ['a.title', '[class*="note-title"]', '.title', 'h3', 'h2']);
    const authorNode = query(root, ['.author .name', '[class*="author"] [class*="name"]', '[class*="user-name"]']);
    const likeNode = query(root, ['.like-wrapper .count', '[class*="like-count"]']);
    const imageNode = query(root, ['.cover img', '[class*="cover"] img']);
    links.push({
      index: links.length + 1,
      noteId,
      title: attrText(titleNode) || (anchor.children.length === 0 ? attrText(anchor) : null),
      author: attrText(authorNode) || null,
      url,
      likeCount: attrText(likeNode) || null,
      image: imageNode?.currentSrc || imageNode?.src || null,
    });
    if (links.length >= maxItems + 1) break;
  }
  const detail = query(document, ['.note-detail-mask .note-container', '.note-container', '[class*="note-detail"]', '[class*="note-container"]']);
  const noteRoot = detail || document.querySelector('article');
  const noteTitle = query(noteRoot, ['[class*="note-title"]', '[class*="title"]', 'h1']);
  const noteAuthor = query(noteRoot, ['[class*="author"] [class*="name"]', '[class*="author"]', '[class*="user-name"]']);
  const noteText = query(noteRoot, ['#detail-desc', '[class*="note-content"]', '[class*="desc"]']);
  const notePath = /^\/(?:explore|search_result)\/[^/]+/.test(path);
  const mediaRoot = notePath ? noteRoot?.querySelector('.media-container, [class*="media-container"], .xhs-slider-container, [class*="carousel"], [class*="swiper"]') : null;
  const resolveImageUrl = (value) => {
    try { return value ? new URL(value, location.href).href : null; } catch { return null; }
  };
  const mediaCandidates = mediaRoot ? [...mediaRoot.querySelectorAll('img')].slice(0, 120).map((image) => {
    const rect = image.getBoundingClientRect();
    const classes = [];
    for (let node = image; node; node = node.parentElement) {
      classes.push(String(node.className?.baseVal || node.className || ""));
      if (node === mediaRoot) break;
    }
    return {
      currentSrc: resolveImageUrl(image.currentSrc),
      src: resolveImageUrl(image.getAttribute('src')),
      dataSrc: resolveImageUrl(image.getAttribute('data-src')),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      displayWidth: rect.width,
      displayHeight: rect.height,
      classContext: classes.join(' '),
      inMediaRoot: true,
      inSlide: Boolean(image.closest('.swiper-slide, [class*="carousel-item"], [class*="note-slider-img"]')),
      duplicateSlide: Boolean(image.closest('.swiper-slide-duplicate')),
    };
  }) : [];
  const note = privatePage ? null : {
    title: attrText(noteTitle) || compact(meta("og:title")) || null,
    author: attrText(noteAuthor) || null,
    text: compact(noteText?.innerText, 12000) || null,
    mediaCandidates,
    metadata: { description: compact(meta("description") || meta("og:description"), 12000) || null },
  };
  return {
    url: location.href,
    title: compact(document.title, 300),
    signalText,
    loginState,
    cards: links.slice(0, maxItems),
    cardsTruncated: links.length > maxItems,
    note,
    hasDetail: Boolean(detail),
  };
}

export function captureComments(limit = 20) {
  const compact = (value, max = 2000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const pick = (root, selectors) => selectors.map((s) => root.querySelector(s)).find((element) => visible(element) && element.closest('.comment-item, [class*="comment-item"]') === root);
  const root = document.querySelector('[class*="comment-list"], [class*="comments-container"], #comment');
  const nodes = root ? [...root.querySelectorAll('.comment-item, [class*="comment-item"]')].filter(visible) : [];
  const top = nodes.filter((node) => !node.parentElement?.closest('.comment-item, [class*="comment-item"]'));
  const parse = (node, includeReplies) => {
    const author = pick(node, ['[class*="user-name"]', '[class*="author"]', '[class*="name"]']);
    const content = pick(node, ['[class*="comment-content"]', '[class*="content"]', '[class*="text"]']);
    const like = pick(node, ['[class*="like-count"]', '[class*="like"]']);
    const time = pick(node, ['[class*="time"]', '[class*="date"]']);
    const location = pick(node, ['[class*="location"]', '[class*="ip"]']);
    const replies = includeReplies ? [...node.querySelectorAll('.comment-item, [class*="comment-item"]')].filter(visible).slice(0, 5).map((reply) => parse(reply, false)) : [];
    return { author: compact(author?.innerText, 150) || null, text: compact(content?.innerText) || null, likeCount: compact(like?.innerText, 50) || null, time: compact(time?.innerText, 100) || null, location: compact(location?.innerText, 100) || null, isAuthor: Boolean(node.querySelector('[class*="author-tag"], [class*="author-badge"]')), replies };
  };
  return { comments: top.slice(0, limit).map((node) => parse(node, true)).filter((item) => item.text), totalVisible: top.length, selectorFound: Boolean(root) };
}

export function findControl(kind) {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width >= 8 && rect.height >= 8 && style.display !== "none" && style.visibility !== "hidden" && rect.top < innerHeight && rect.left < innerWidth && rect.bottom > 0 && rect.right > 0;
  };
  const point = (element) => {
    const rect = element.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    return document.elementFromPoint(x, y) === element || element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  };
  if (kind === "home") {
    const items = [...document.querySelectorAll('a[href], [role="link"]')];
    for (const item of items) {
      if (item.innerText.trim() !== "首页" || !visible(item)) continue;
      const href = item.getAttribute("href") || "";
      if (href) {
        const destination = new URL(href, location.href);
        if (destination.hostname !== location.hostname || !["/", "/explore"].includes(destination.pathname)) continue;
      }
      const target = point(item);
      if (target) return target;
    }
    return null;
  }
  const detail = document.querySelector('.note-detail-mask, [class*="note-detail-mask"], [class*="note-detail-overlay"]');
  if (!detail || !visible(detail)) return null;
  if (kind === "close") {
    const buttons = [...detail.querySelectorAll('button, [role="button"], [class*="close"], [aria-label]')];
    for (const item of buttons) {
      const label = `${item.getAttribute("aria-label") || ""} ${item.getAttribute("title") || ""} ${item.className?.baseVal || item.className || ""}`;
      if (!/(?:关闭|close|^x$)/i.test(label) || !visible(item)) continue;
      const target = point(item);
      if (target) return target;
    }
    return null;
  }
  if (kind === "backdrop") {
    const content = detail.querySelector('.note-container, [class*="note-container"], [class*="note-content"]');
    if (!content || !visible(content)) return null;
    const rect = content.getBoundingClientRect();
    const candidates = [[Math.max(8, rect.left / 2), innerHeight / 2], [(rect.right + innerWidth) / 2, innerHeight / 2], [innerWidth / 2, Math.max(8, rect.top / 2)]];
    for (const [px, py] of candidates) {
      const x = Math.round(px), y = Math.round(py);
      if (x < 8 || y < 8 || x > innerWidth - 8 || y > innerHeight - 8 || (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) continue;
      const element = document.elementFromPoint(x, y);
      if (!element || !(element === detail || element.closest('.note-detail-mask, [class*="note-detail-mask"], [class*="note-detail-overlay"]') === detail)) continue;
      if (element.closest('a, button, input, textarea, [contenteditable], [role="button"], [class*="like"], [class*="favorite"], [class*="collect"], [class*="follow"], [class*="comment"], [class*="submit"], [class*="avatar"], nav')) continue;
      if (element === detail || /mask|backdrop|overlay/i.test(String(element.className?.baseVal || element.className || ""))) return { x, y };
    }
  }
  return null;
}

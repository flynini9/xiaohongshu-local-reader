const NOTE_PATH = /^\/(?:explore|search_result)\/([^/]+)\/?$/;

export function tokenizedNoteUrl(noteId, value) {
  if (typeof noteId !== "string" || typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(NOTE_PATH);
    if (url.protocol !== "https:" || !/(^|\.)xiaohongshu\.com$/i.test(url.hostname) ||
        !match || decodeURIComponent(match[1]) !== noteId || !url.searchParams.get("xsec_token")) return null;
    return value; // Keep the DOM href byte-for-byte, including xsec_source and other query parameters.
  } catch {
    return null;
  }
}

export function findTokenizedNoteUrl(noteId, cards = []) {
  for (const card of cards) {
    if (card?.noteId !== noteId) continue;
    const url = tokenizedNoteUrl(noteId, card.url);
    if (url) return url;
  }
  return null;
}

export class NoteUrlCache {
  constructor({ maxEntries = 200, ttlMs = 10 * 60 * 1000 } = {}) {
    this.entries = new Map();
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  remember(cards, now = Date.now()) {
    for (const card of cards || []) {
      const url = tokenizedNoteUrl(card?.noteId, card?.url);
      if (!url) continue;
      this.entries.delete(card.noteId);
      this.entries.set(card.noteId, { url, expiresAt: now + this.ttlMs });
      while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    }
  }

  get(noteId, now = Date.now()) {
    const entry = this.entries.get(noteId);
    if (!entry) return null;
    if (entry.expiresAt <= now || !tokenizedNoteUrl(noteId, entry.url)) {
      this.entries.delete(noteId);
      return null;
    }
    return entry.url;
  }
}

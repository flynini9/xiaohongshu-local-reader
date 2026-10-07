export const MAX_NOTE_TEXT_CHARS = 12000;

export function normalizeNoteText(value, maxChars = MAX_NOTE_TEXT_CHARS) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function chooseNoteText(domText, metaDescription) {
  const dom = normalizeNoteText(domText);
  const meta = normalizeNoteText(metaDescription);
  if (!dom) return { text: meta || null, textSource: meta ? "meta_description" : null };
  if (!meta || dom.length >= meta.length || dom.includes(meta)) return { text: dom, textSource: "dom" };
  if (meta.includes(dom)) return { text: meta, textSource: "meta_description" };

  // Some meta descriptions add a title or differ slightly in formatting. Require
  // two substantial matching passages before accepting the longer candidate.
  const sampleSize = Math.min(80, Math.floor(dom.length / 3));
  const middle = Math.floor((dom.length - sampleSize) / 2);
  const related = sampleSize >= 20 &&
    meta.includes(dom.slice(0, sampleSize)) &&
    meta.includes(dom.slice(middle, middle + sampleSize));
  const clearlyLonger = meta.length >= Math.max(dom.length + 120, Math.ceil(dom.length * 1.3));
  return related && clearlyLonger
    ? { text: meta, textSource: "meta_description" }
    : { text: dom, textSource: "dom" };
}

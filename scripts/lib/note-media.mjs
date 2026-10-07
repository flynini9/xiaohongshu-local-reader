const EXCLUDED = /(?:^|[\s_-])(?:avatar|author|user-info|comment|logo|icon|emoji|nav|navigation|follow|recommend|related|widget|button|control|video|poster)(?:$|[\s_-])/i;

export function extractNoteMedia(candidates = [], limit = 30) {
  const accepted = [];
  for (const candidate of candidates) {
    if (!candidate?.inMediaRoot || EXCLUDED.test(candidate.classContext || "")) continue;
    let raw;
    let url;
    for (const value of [candidate.currentSrc, candidate.src, candidate.dataSrc]) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol === "https:") { raw = value; url = parsed; break; }
      } catch { /* Try the next DOM-exposed source. */ }
    }
    if (!url || /sns-avatar/i.test(url.hostname + url.pathname)) continue;
    const width = Number(candidate.naturalWidth) || Number(candidate.displayWidth) || 0;
    const height = Number(candidate.naturalHeight) || Number(candidate.displayHeight) || 0;
    if (width > 0 && height > 0 && (width < 80 || height < 80)) continue;
    if (width === 0 && height === 0 && !candidate.inSlide) continue;
    accepted.push({ url: raw, duplicateSlide: Boolean(candidate.duplicateSlide) });
  }
  const originals = accepted.filter((item) => !item.duplicateSlide);
  const ordered = originals.length ? [...originals, ...accepted.filter((item) => item.duplicateSlide)] : accepted;
  const images = [];
  const seen = new Set();
  for (const item of ordered) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    images.push(item.url);
    if (images.length >= limit) break;
  }
  return { image: images[0] ?? null, images, imageCount: images.length };
}

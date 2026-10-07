import assert from "node:assert/strict";
import { extractNoteMedia } from "./lib/note-media.mjs";
import { findTokenizedNoteUrl, NoteUrlCache, tokenizedNoteUrl } from "./lib/note-url.mjs";

const fullUrl = "https://www.xiaohongshu.com/search_result/abc123?xsec_token=DOM_ONLY&xsec_source=pc_search&other=keep";
const cards = [{ noteId: "abc123", url: fullUrl }];
assert.equal(findTokenizedNoteUrl("abc123", cards), fullUrl, "noteId resolves to the observed URL");
assert.equal(tokenizedNoteUrl("abc123", fullUrl), fullUrl, "query string is preserved exactly");
assert.equal(findTokenizedNoteUrl("missing", cards), null, "unknown noteId has no fabricated fallback");
assert.equal(tokenizedNoteUrl("abc123", "https://www.xiaohongshu.com/explore/abc123"), null, "bare URL is not used");
assert.equal(tokenizedNoteUrl("abc123", "https://notxiaohongshu.com/explore/abc123?xsec_token=x"), null);

const cache = new NoteUrlCache({ ttlMs: 1000, maxEntries: 2 });
cache.remember(cards, 100);
cache.remember([{ noteId: "bare", url: "https://www.xiaohongshu.com/explore/bare" }], 100);
assert.equal(cache.get("abc123", 500), fullUrl);
assert.equal(cache.get("bare", 500), null, "cache stores only observed tokenized links");
assert.equal(cache.get("abc123", 1100), null, "stale observed links expire");

const picture = (url, extra = {}) => ({
  src: url, inMediaRoot: true, inSlide: true, classContext: "note-slider-img swiper-slide media-container",
  naturalWidth: 1000, naturalHeight: 1500, ...extra,
});
const first = "https://sns-webpic-qc.xhscdn.com/body-1.jpg";
const second = "https://sns-webpic-qc.xhscdn.com/body-2.jpg";
const third = "https://sns-webpic-qc.xhscdn.com/body-3.jpg";
const media = extractNoteMedia([
  picture(second, { duplicateSlide: true }),
  picture(first), picture(second), picture(first, { duplicateSlide: true }),
  picture("https://sns-avatar-qc.xhscdn.com/user.jpg"),
  picture("https://sns-webpic-qc.xhscdn.com/author.jpg", { classContext: "media-container author avatar" }),
  picture("https://sns-webpic-qc.xhscdn.com/comment.jpg", { classContext: "media-container comment-picture" }),
  picture("https://sns-webpic-qc.xhscdn.com/video-cover.jpg", { classContext: "media-container video poster" }),
  picture("https://sns-webpic-qc.xhscdn.com/icon.jpg", { naturalWidth: 32, naturalHeight: 32 }),
  picture(third, { src: null, currentSrc: "data:image/gif;base64,placeholder", dataSrc: third, naturalWidth: 0, naturalHeight: 0, displayWidth: 0, displayHeight: 0 }),
]);
assert.deepEqual(media.images, [first, second, third], "body images are ordered, deduplicated and lazy sources are included");
assert.equal(media.image, media.images[0]);
assert.equal(media.imageCount, media.images.length);
assert.deepEqual(extractNoteMedia([]), { image: null, images: [], imageCount: 0 });
assert.deepEqual(extractNoteMedia([picture("https://sns-avatar-qc.xhscdn.com/user.jpg")]), { image: null, images: [], imageCount: 0 });
console.log("PASS note URL and body media tests");

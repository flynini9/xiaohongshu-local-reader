import assert from "node:assert/strict";
import { capturePage } from "./lib/browser-dom.mjs";
import { chooseNoteText, MAX_NOTE_TEXT_CHARS, normalizeNoteText } from "./lib/note-text.mjs";
import { retrySnapshotEvaluate } from "./lib/retry-snapshot.mjs";

const longDom = "正文第一段 " + "长正文内容 ".repeat(180);
assert.ok(normalizeNoteText(longDom).length > 500, "body text is not capped at the short-field limit");

// Exercise the serialized browser extraction itself with a small DOM fixture.
const previous = { document: globalThis.document, location: globalThis.location, getComputedStyle: globalThis.getComputedStyle };
const element = (innerText) => ({ innerText, getBoundingClientRect: () => ({ width: 100, height: 30 }) });
const bodyNode = element(longDom);
const noteRoot = {
  ...element(""),
  querySelector: (selector) => selector === "#detail-desc" ? bodyNode : null,
};
globalThis.document = {
  body: element(longDom), title: "测试长帖",
  querySelectorAll: () => [],
  querySelector: (selector) => selector === ".note-detail-mask .note-container" ? noteRoot : null,
};
globalThis.location = { pathname: "/explore/abc", href: "https://www.xiaohongshu.com/explore/abc" };
globalThis.getComputedStyle = () => ({ visibility: "visible", display: "block" });
try {
  assert.equal(capturePage(0).note.text, normalizeNoteText(longDom));
} finally {
  Object.assign(globalThis, previous);
}

assert.deepEqual(chooseNoteText(longDom, "短元信息"), { text: normalizeNoteText(longDom), textSource: "dom" });

const truncatedDom = normalizeNoteText(longDom).slice(0, 500);
const longerMeta = normalizeNoteText(longDom + " 结尾补充信息");
assert.deepEqual(chooseNoteText(truncatedDom, longerMeta), { text: longerMeta, textSource: "meta_description" });
assert.deepEqual(chooseNoteText(truncatedDom, "完全不相关的文字 ".repeat(200)), { text: truncatedDom, textSource: "dom" });
assert.deepEqual(chooseNoteText("简短正文", "无关内容"), { text: "简短正文", textSource: "dom" });
assert.equal(chooseNoteText("", "只有元信息").text, "只有元信息");
assert.equal(chooseNoteText("超长内容 ".repeat(4000), "").text.length, MAX_NOTE_TEXT_CHARS);

const timeout = () => new Error("Browser CDP timed out: Runtime.evaluate");
let attempts = 0;
let waits = 0;
assert.equal(await retrySnapshotEvaluate(async () => {
  attempts++;
  if (attempts === 1) throw timeout();
  return "snapshot";
}, async () => { waits++; }), "snapshot");
assert.equal(attempts, 2);
assert.equal(waits, 1);

attempts = 0;
await assert.rejects(retrySnapshotEvaluate(async () => { attempts++; throw timeout(); }, async () => {}), /Browser CDP timed out: Runtime\.evaluate/);
assert.equal(attempts, 2, "a second timeout is returned without another retry");

attempts = 0;
await assert.rejects(retrySnapshotEvaluate(async () => { attempts++; throw new Error("DOM exception"); }, async () => { waits++; }), /DOM exception/);
assert.equal(attempts, 1, "non-timeout failures are not retried");
assert.equal(waits, 1);
console.log("PASS note text selection and snapshot retry tests");

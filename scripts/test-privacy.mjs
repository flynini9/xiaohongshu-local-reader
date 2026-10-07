import assert from 'node:assert/strict';
import { capturePage } from './lib/browser-dom.mjs';

const previous = { document: globalThis.document, location: globalThis.location, getComputedStyle: globalThis.getComputedStyle };
try {
  const body = { get innerText() { throw new Error('Private body must not be read'); } };
  globalThis.document = { body, title: 'Synthetic private page', querySelector: () => null, querySelectorAll: () => [] };
  globalThis.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  for (const path of ['/chat', '/chat/synthetic', '/message', '/notification', '/notifications']) {
    globalThis.location = { pathname: path, href: `https://www.xiaohongshu.com${path}` };
    const snapshot = capturePage();
    assert.equal(snapshot.signalText, '');
    assert.equal(snapshot.note, null);
    assert.deepEqual(snapshot.cards, []);
  }
} finally { Object.assign(globalThis, previous); }
console.log('PASS private-page body suppression (synthetic DOM)');

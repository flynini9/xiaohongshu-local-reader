import assert from "node:assert/strict";
import { classifyPage } from "./lib/page-state.mjs";

const cases = [
  [{ url: "chrome-error://chromewebdata/" }, "network_error"],
  [{ url: "https://www.xiaohongshu.com/search_result?keyword=x", signalText: "ERR_CONNECTION_CLOSED" }, "network_error"],
  [{ url: "https://www.xiaohongshu.com/explore/abc?error_code=300031" }, "access_limited"],
  [{ url: "https://www.xiaohongshu.com/explore/abc", signalText: "当前笔记暂时无法浏览" }, "access_limited"],
  [{ url: "https://www.xiaohongshu.com/search_result?keyword=x" }, "search_results"],
  [{ url: "https://www.xiaohongshu.com/search_result/abc?xsec_token=opaque" }, "note_page"],
  [{ url: "https://www.xiaohongshu.com/chat" }, "chat_page"],
  [{ url: "https://www.xiaohongshu.com/explore/abc?xsec_token=opaque&xsec_source=pc_search" }, "note_page"],
  [{ url: "https://www.xiaohongshu.com/" }, "home_feed"],
  [{ url: "https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend" }, "home_feed"],
];
for (const [input, expected] of cases) assert.equal(classifyPage(input).pageKind, expected, JSON.stringify(input));
assert.equal(classifyPage({ url: "https://www.xiaohongshu.com/explore/abc?error_code=300031" }).errorCode, "300031");
console.log(`PASS page classifier (${cases.length} cases)`);

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  downloadImage,
  fetchImageBlock,
  isAllowedImageUrl,
  isPublicImageAddress,
} from "./lib/image-attachments.mjs";

const url = "https://ci.xiaohongshu.com/synthetic.jpg";
assert.equal(isAllowedImageUrl(url), true);
assert.equal(isAllowedImageUrl("https://a.xhscdn.com/image.jpg"), true);
assert.equal(isAllowedImageUrl("https://xhscdn.com/image.jpg"), true);
for (const bad of [
  "http://ci.xiaohongshu.com/a.jpg",
  "https://ci.xiaohongshu.com.evil.test/a.jpg",
  "https://ci.xiaohongshu.com@evil.test/a.jpg",
  "https://ci.xiaohongshu.com:444/a.jpg",
  "https://127.0.0.1/a.jpg",
]) assert.equal(isAllowedImageUrl(bad), false);
for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "224.0.0.1", "2001:db8::1"]) {
  assert.equal(isPublicImageAddress(address), false, address);
}
assert.equal(isPublicImageAddress("8.8.8.8"), true);

const publicResolve = async () => [{ address: "8.8.8.8", family: 4 }];
function mockRequest({ statusCode = 200, headers = {}, chunks = [Buffer.from("image-bytes")] } = {}) {
  return (_url, options, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      const response = Readable.from(chunks);
      response.statusCode = statusCode;
      response.headers = headers;
      queueMicrotask(() => callback(response));
    };
    req.options = options;
    return req;
  };
}

const downloaded = await downloadImage(url, {
  resolve: publicResolve,
  request: mockRequest({ headers: { "content-type": "image/jpeg" } }),
});
assert.equal(downloaded.mimeType, "image/jpeg");
assert.equal(downloaded.bytes.toString(), "image-bytes");

const block = await fetchImageBlock(url, 100, {
  resolve: publicResolve,
  request: mockRequest({ headers: { "content-type": "image/png" }, chunks: [Buffer.from("png")] }),
});
assert.equal(block.content.type, "image");
assert.equal(block.content.mimeType, "image/png");
assert.equal(Buffer.from(block.content.data, "base64").toString(), "png");
assert.equal(block.bytes, 3);

await assert.rejects(
  downloadImage(url, { resolve: async () => [{ address: "127.0.0.1", family: 4 }], request: mockRequest({ headers: { "content-type": "image/jpeg" } }) }),
  /IMAGE_DNS_REJECTED/,
);
await assert.rejects(
  downloadImage(url, { resolve: publicResolve, request: mockRequest({ statusCode: 302, headers: { location: "https://127.0.0.1/private.jpg" } }) }),
  /IMAGE_URL_REJECTED/,
);
await assert.rejects(
  downloadImage(url, { resolve: publicResolve, request: mockRequest({ headers: { "content-type": "text/html" } }) }),
  /IMAGE_MIME_REJECTED/,
);
await assert.rejects(
  downloadImage(url, { maxBytes: 2, resolve: publicResolve, request: mockRequest({ headers: { "content-type": "image/jpeg", "content-length": "100" } }) }),
  /IMAGE_SIZE_OR_ENCODING_REJECTED/,
);
await assert.rejects(
  downloadImage(url, { maxBytes: 2, resolve: publicResolve, request: mockRequest({ headers: { "content-type": "image/jpeg" }, chunks: [Buffer.from("too large")] }) }),
  /IMAGE_TOO_LARGE/,
);

console.log("PASS image MIME, host allowlist, public DNS pinning, redirect validation, response size limits and MCP image block shape");

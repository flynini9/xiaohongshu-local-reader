import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 2;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const IMAGE_MIME = /^image\/(?:jpeg|png|webp|gif|avif)$/;

export function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowedHost = host === "ci.xiaohongshu.com" || host === "xhscdn.com" || host.endsWith(".xhscdn.com");
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && allowedHost;
  } catch {
    return false;
  }
}

export function isPublicImageAddress(value) {
  if (isIP(value) === 4) {
    const [a, b, c] = value.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(value) !== 6 || value.includes(".")) return false;
  const words = value.toLowerCase().split(":");
  const first = parseInt(words[0], 16);
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && ["0", "0000", "db8", "0db8", "20", "0020"].includes(words[1]));
}

async function validatedImageAddress(hostname, resolve) {
  const addresses = await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicImageAddress(item.address))) {
    throw new Error("IMAGE_DNS_REJECTED");
  }
  return addresses[0];
}

export async function downloadImage(value, {
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  resolve = lookup,
  request = https.request,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let url;
  try { url = new URL(value); } catch { throw new Error("IMAGE_URL_REJECTED"); }

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!isAllowedImageUrl(url.href)) throw new Error("IMAGE_URL_REJECTED");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("IMAGE_TIMEOUT");
    const signal = AbortSignal.timeout(remaining);
    let abort;
    let address;
    try {
      address = await Promise.race([
        validatedImageAddress(url.hostname, resolve),
        new Promise((_, reject) => {
          abort = () => reject(new Error("IMAGE_TIMEOUT"));
          signal.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } catch (error) {
      if (error.message === "IMAGE_TIMEOUT") throw error;
      throw new Error("IMAGE_DNS_REJECTED");
    } finally {
      if (abort) signal.removeEventListener("abort", abort);
    }
    signal.throwIfAborted();

    const response = await new Promise((resolveResponse, reject) => {
      const req = request(url, {
        signal,
        agent: false,
        lookup: (_hostname, options, callback) => options.all
          ? callback(null, [address])
          : callback(null, address.address, address.family),
        headers: {
          Referer: "https://www.xiaohongshu.com/",
          "Accept-Encoding": "identity",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1",
          "User-Agent": "XHS-Local-Reader",
        },
      }, resolveResponse);
      req.once("error", () => reject(new Error(signal.aborted ? "IMAGE_TIMEOUT" : "IMAGE_NETWORK_FAILED")));
      req.end();
    });

    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location;
      response.destroy();
      if (!location || redirects === MAX_REDIRECTS) throw new Error("IMAGE_REDIRECT_REJECTED");
      try { url = new URL(location, url); } catch { throw new Error("IMAGE_REDIRECT_REJECTED"); }
      continue;
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error("IMAGE_HTTP_" + response.statusCode);
    }
    const mimeType = String(response.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (!IMAGE_MIME.test(mimeType)) {
      response.destroy();
      throw new Error("IMAGE_MIME_REJECTED");
    }
    if (Number(response.headers["content-length"]) > maxBytes ||
      (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
      response.destroy();
      throw new Error("IMAGE_SIZE_OR_ENCODING_REJECTED");
    }

    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of response) {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy();
          throw new Error("IMAGE_TOO_LARGE");
        }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error.message === "IMAGE_TOO_LARGE") throw error;
      throw new Error(signal.aborted ? "IMAGE_TIMEOUT" : "IMAGE_NETWORK_FAILED");
    }
    if (!size) throw new Error("IMAGE_EMPTY");
    return { bytes: Buffer.concat(chunks, size), mimeType };
  }
  throw new Error("IMAGE_REDIRECT_REJECTED");
}

export async function fetchImageBlock(value, maxBytes = DEFAULT_MAX_BYTES, options = {}) {
  const image = await downloadImage(value, { ...options, maxBytes });
  return {
    bytes: image.bytes.length,
    content: { type: "image", data: image.bytes.toString("base64"), mimeType: image.mimeType },
  };
}

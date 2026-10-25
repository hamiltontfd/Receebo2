import { test } from "vitest";
import assert from "node:assert/strict";
import { verifyRanges } from "./verify-ranges.mjs";

const bytes = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256));
// Test the verifier itself: it must reject a server that ignores Range or
// sends plausible headers but the wrong body. Real endpoint checks run in verify.
function delivery(breakResponse = () => {}) {
  const seen = [];
  return {
    seen,
    async get(_src, { headers }) {
      const range = headers.Range;
      seen.push(range || "full");
      const result = {
        status: range ? 206 : 200,
        headers: { "content-type": "video/mp4", "accept-ranges": "bytes" },
        body: bytes,
      };
      if (range) {
        let [start, end] = range.slice(6).split("-").map(Number);
        if (range.startsWith("bytes=-")) {
          start = bytes.length - end;
          end = bytes.length - 1;
        } else if (range.endsWith("-")) end = bytes.length - 1;
        end = Math.min(end, bytes.length - 1);
        if (start >= bytes.length || start > end || range.includes(",")) {
          result.status = 416;
          result.headers["content-range"] = `bytes */${bytes.length}`;
          result.body = Buffer.alloc(0);
        } else {
          result.headers["content-range"] = `bytes ${start}-${end}/${bytes.length}`;
          result.body = bytes.subarray(start, end + 1);
        }
      }
      result.headers["content-length"] = String(result.body.length);
      breakResponse(result, range);
      return {
        status: () => result.status,
        headers: () => result.headers,
        body: async () => result.body,
        dispose: async () => {},
      };
    },
  };
}
const source = { src: "http://localhost/api/storage/public-objects/marketing/test.mp4", type: "video/mp4" };

test("checks explicit, open, suffix, clipped and invalid ranges", async () => {
  const request = delivery();
  const result = await verifyRanges(request, source);
  assert.equal(result.size, 512);
  assert.equal(request.seen.length, 9);
  assert(request.seen.includes("bytes=-64"));
  assert(request.seen.includes("bytes=512-"));
});
for (const [name, corrupt, error] of [
  ["ignored Range", (r, range) => { if (range) r.status = 200; }, /status/],
  ["incorrect suffix bytes", (r, range) => { if (range === "bytes=-64") r.body = bytes.subarray(0, 64); }, /wrong bytes/],
  ["incorrect Content-Range", (r, range) => { if (range) r.headers["content-range"] = "bytes 0-1/512"; }, /Content-Range/],
  ["incorrect MIME", r => { r.headers["content-type"] = "text/html"; }, /MIME/],
  ["incorrect length", r => { r.headers["content-length"] = "7"; }, /Content-Length/],
  ["missing range support", r => { delete r.headers["accept-ranges"]; }, /Accept-Ranges/],
  ["invalid range returns video data", (r, range) => { if (range === "bytes=512-") r.body = bytes; }, /must not return video bytes/],
]) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(() => verifyRanges(delivery(corrupt), source), error);
  });
}

import assert from "node:assert/strict";

// Exercise the actual public delivery endpoint, not a mocked Range parser.
export async function verifyRanges(request, { src, type }) {
  const get = headers => request.get(src, { headers, timeout: 20000 });
  const full = await get({ "Accept-Encoding": "identity" });
  try {
    assert.equal(full.status(), 200, `${src}: full GET`);
    assert.equal(full.headers()["accept-ranges"], "bytes", `${src}: missing Accept-Ranges`);
    assert.equal(full.headers()["content-type"]?.split(";")[0], type, `${src}: MIME type`);
    const bytes = await full.body();
    const size = bytes.length;
    assert(size > 128, `${src}: empty or truncated video`);
    assert.equal(Number(full.headers()["content-length"]), size, `${src}: full Content-Length`);
    const cases = [
      { range: "bytes=0-63", start: 0, end: 63 },
      { range: `bytes=${size - 64}-`, start: size - 64, end: size - 1 },
      { range: "bytes=-64", start: size - 64, end: size - 1 },
      { range: `bytes=${size - 32}-${size + 100}`, start: size - 32, end: size - 1 },
      { range: `bytes=${size}-`, invalid: true },
      { range: "bytes=64-1", invalid: true },
      { range: "bytes=-0", invalid: true },
      { range: "bytes=0-1,4-5", invalid: true },
    ];
    for (const { range, start, end, invalid } of cases) {
      const response = await get({ Range: range, "Accept-Encoding": "identity" });
      try {
        const headers = response.headers();
        const body = await response.body();
        assert.equal(response.status(), invalid ? 416 : 206, `${src}: ${range} status`);
        assert.equal(headers["accept-ranges"], "bytes", `${src}: ${range} Accept-Ranges`);
        assert.equal(headers["content-range"], invalid ? `bytes */${size}` : `bytes ${start}-${end}/${size}`, `${src}: ${range} Content-Range`);
        if (invalid) {
          assert.equal(body.length, 0, `${src}: ${range} must not return video bytes`);
        } else {
          assert.equal(headers["content-type"]?.split(";")[0], type, `${src}: ${range} MIME type`);
          assert.equal(Number(headers["content-length"]), end - start + 1, `${src}: ${range} Content-Length`);
          assert.deepEqual(body, bytes.subarray(start, end + 1), `${src}: ${range} wrong bytes`);
        }
      } finally {
        await response.dispose();
      }
    }
    return { src, type, size, ranges: cases.map(c => c.range) };
  } finally {
    await full.dispose();
  }
}

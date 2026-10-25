import { Readable } from "node:stream";
import type { File } from "@google-cloud/storage";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ visibility: "private" }));
vi.mock("./objectAcl", () => ({
  getObjectAclPolicy: async () => ({ visibility: mocks.visibility }),
}));
import { ObjectStorageService } from "./objectStorage";

describe("object download cache policy", () => {
  it.each(["private", "public"])("applies the correct policy for %s files", async (visibility) => {
    mocks.visibility = visibility;
    const file = {
      getMetadata: async () => [{ contentType: "image/png", size: 4 }],
      createReadStream: () => Readable.from([Buffer.from("file")]),
    } as unknown as File;
    const response = await new ObjectStorageService().downloadObject(file);
    expect(response.headers.get("cache-control")).toBe(
      visibility === "public" ? "public, max-age=3600" : "private, no-store",
    );
    expect(await response.text()).toBe("file");
  });
});

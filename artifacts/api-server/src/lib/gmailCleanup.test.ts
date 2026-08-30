import { describe, expect, it, vi } from "vitest";
import { deletePendingImportObjects } from "./gmailCleanup";

const pendingImports = [
  { id: 1, objectPath: ".private/uploads/one.pdf" },
  { id: 2, objectPath: ".private/uploads/two.pdf" },
];

describe("deletePendingImportObjects", () => {
  it("deletes every pending Gmail object before disconnect", async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    const failed = await deletePendingImportObjects(
      pendingImports,
      deleteObject,
      () => false,
    );

    expect(failed).toEqual([]);
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenNthCalledWith(
      1,
      ".private/uploads/one.pdf",
    );
  });

  it("treats already-missing objects as successfully removed", async () => {
    const missing = new Error("missing");
    const deleteObject = vi
      .fn()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce(undefined);

    const failed = await deletePendingImportObjects(
      pendingImports,
      deleteObject,
      (error) => error === missing,
    );

    expect(failed).toEqual([]);
  });

  it("reports storage failures so disconnect cannot falsely succeed", async () => {
    const storageFailure = new Error("storage unavailable");
    const onFailure = vi.fn();
    const deleteObject = vi
      .fn()
      .mockRejectedValueOnce(storageFailure)
      .mockResolvedValueOnce(undefined);

    const failed = await deletePendingImportObjects(
      pendingImports,
      deleteObject,
      () => false,
      onFailure,
    );

    expect(failed).toEqual([1]);
    expect(onFailure).toHaveBeenCalledWith(pendingImports[0], storageFailure);
  });

  it("deletes legacy dismissed imports as well as pending imports", async () => {
    const removableImports = [
      { id: 3, objectPath: ".private/uploads/pending.pdf", status: "pending" },
      { id: 4, objectPath: ".private/uploads/dismissed.pdf", status: "dismissed" },
    ];
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    const failed = await deletePendingImportObjects(
      removableImports,
      deleteObject,
      () => false,
    );

    expect(failed).toEqual([]);
    expect(deleteObject).toHaveBeenCalledWith(
      ".private/uploads/dismissed.pdf",
    );
  });
});
import { describe, expect, it, vi } from "vitest";
import {
  cancelSubscriptionForDeletion,
  deleteAccountObjects,
} from "./accountDeletion";

describe("cancelSubscriptionForDeletion", () => {
  it("cancels an active subscription before deleting account data", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);

    await cancelSubscriptionForDeletion("sub_123", cancel);

    expect(cancel).toHaveBeenCalledWith("sub_123");
  });

  it("fails closed when Stripe cancellation fails", async () => {
    const failure = Object.assign(new Error("Stripe unavailable"), {
      code: "api_connection_error",
    });

    await expect(
      cancelSubscriptionForDeletion(
        "sub_123",
        vi.fn().mockRejectedValue(failure),
      ),
    ).rejects.toBe(failure);
  });

  it("allows deletion when Stripe confirms the subscription is already gone", async () => {
    const missing = Object.assign(new Error("missing"), {
      code: "resource_missing",
    });

    await expect(
      cancelSubscriptionForDeletion(
        "sub_123",
        vi.fn().mockRejectedValue(missing),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("deleteAccountObjects", () => {
  it("deduplicates paths and reports failures before database deletion", async () => {
    const failure = new Error("storage unavailable");
    const deleteObject = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure);

    const failed = await deleteAccountObjects(
      ["one.pdf", "one.pdf", "two.pdf"],
      deleteObject,
      () => false,
    );

    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(failed).toEqual(["two.pdf"]);
  });

  it("treats a retry after files were already removed as successful", async () => {
    const missing = new Error("already removed");

    const failed = await deleteAccountObjects(
      ["one.pdf"],
      vi.fn().mockRejectedValue(missing),
      (error) => error === missing,
    );

    expect(failed).toEqual([]);
  });
});
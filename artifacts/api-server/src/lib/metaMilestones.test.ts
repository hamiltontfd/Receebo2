import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), consent: vi.fn(), send: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("./adAttributionStore", () => ({ marketingConsentFor: mocks.consent }));
vi.mock("./metaCapi", () => ({ sendMetaEvent: mocks.send }));
import { returnMetaMilestone, sendMilestone, withFirstReceiptEvent } from "./metaMilestones";
import type { Response } from "express";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consent.mockResolvedValue(true);
  mocks.send.mockResolvedValue({ sent: true });
});

describe("consented milestones, using the existing unique trial funnel", () => {
  it("returns exactly the ID sent to CAPI, with no receipt payload", async () => {
    const event = await sendMilestone("test-account", "CompleteRegistration");
    expect(event).toEqual({ name: "CompleteRegistration", eventId: expect.any(String) });
    expect(mocks.send).toHaveBeenCalledWith({
      eventName: "CompleteRegistration", userId: "test-account", eventId: event!.eventId,
    });
    const res = { setHeader: vi.fn() };
    returnMetaMilestone(res as unknown as Response, event);
    expect(JSON.parse(res.setHeader.mock.calls[0][1])).toEqual(event);
  });
  it("sends FirstReceiptSaved only on an absent → present milestone transition", async () => {
    let committed = false;
    mocks.execute.mockImplementation(async () => ({ rows: committed ? [{ found: 1 }] : [] }));
    const first = await withFirstReceiptEvent("test-account", async () => { committed = true; return "saved"; });
    expect(first.value).toBe("saved");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      eventName: "FirstReceiptSaved", userId: "test-account", eventId: first.event!.eventId,
    });
    expect(Object.keys(mocks.send.mock.calls[0][0]).sort()).toEqual(["eventId", "eventName", "userId"]);
    const later = await withFirstReceiptEvent("test-account", async () => "another receipt");
    expect(later.event).toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not emit without a newly recorded milestone or after rollback", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    expect((await withFirstReceiptEvent("test-account", async () => "not a trial save")).event).toBeUndefined();
    await expect(withFirstReceiptEvent("test-account", async () => { throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not emit either milestone when marketing is not stored as allowed", async () => {
    mocks.consent.mockResolvedValue(false);
    expect(await sendMilestone("test-account", "CompleteRegistration")).toBeUndefined();
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ found: 1 }] });
    expect((await withFirstReceiptEvent("test-account", async () => "saved")).event).toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not fail the product operation if analytics is unavailable", async () => {
    mocks.execute.mockRejectedValue(new Error("analytics unavailable"));
    const result = await withFirstReceiptEvent("test-account", async () => "saved");
    expect(result).toEqual({ value: "saved", event: undefined });
    mocks.send.mockRejectedValue(new Error("network"));
    expect(await sendMilestone("test-account", "CompleteRegistration")).toHaveProperty("eventId");
  });
});

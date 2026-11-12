import { afterEach, describe, expect, it, vi } from "vitest";
import { customFetch, observeResponse, setResponseObserver } from "@workspace/api-client-react";
import { approvePending, bulkApprovePending, alwaysImportSupplier } from "./pendingImports";

afterEach(() => { setResponseObserver(undefined); vi.unstubAllGlobals(); });
describe("shared event metadata transport", () => {
  it("observes successful responses without modifying the parsed result", async () => {
    const response = new Response('{"started":true}', { headers: {
      "Content-Type": "application/json",
      "X-Receebo-Meta-Event": '{"name":"CompleteRegistration","eventId":"test-trial-id"}',
    } });
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const observer = vi.fn();
    setResponseObserver(observer);
    expect(await customFetch("/api/billing/start-trial", { method: "POST" })).toEqual({ started: true });
    expect(observer).toHaveBeenCalledExactlyOnceWith(response);
  });
  it("observer failure never breaks a product response and errors are not observed", () => {
    const observer = vi.fn(() => { throw new Error("optional measurement"); });
    setResponseObserver(observer);
    expect(() => observeResponse(new Response(null))).not.toThrow();
    observeResponse(new Response(null, { status: 500 }));
    expect(observer).toHaveBeenCalledTimes(1);
  });
  it.each(["single", "bulk", "always"] as const)("observes the %s import approval response too", async (kind) => {
    const response = new Response('{"approved":[],"skipped":[],"notFound":[]}', { headers: {
      "Content-Type": "application/json",
      "X-Receebo-Meta-Event": '{"name":"FirstReceiptSaved","eventId":"first-receipt-id"}',
    } });
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const observer = vi.fn();
    setResponseObserver(observer);
    if (kind === "single") await approvePending({ id: 1 });
    else if (kind === "bulk") await bulkApprovePending([1]);
    else await alwaysImportSupplier({ supplierKey: "fictional-supplier" });
    expect(observer).toHaveBeenCalledExactlyOnceWith(response);
  });
});

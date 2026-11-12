import { beforeEach, describe, expect, it, vi } from "vitest";
const track = vi.hoisted(() => vi.fn(() => true));
vi.mock("./metaPixel", () => ({ newEventId: () => "return-event-id", trackMetaEvent: track }));
import { recordAuthenticatedOpen, trackMilestoneResponse } from "./metaLifecycle";

beforeEach(() => { localStorage.clear(); track.mockClear(); });
describe("Meta lifecycle client events", () => {
  it("uses the server's event ID once and sends no receipt parameters", () => {
    const response = new Response(null, { headers: {
      "X-Receebo-Meta-Event": JSON.stringify({ name: "FirstReceiptSaved", eventId: "first-receipt-id" }),
    } });
    trackMilestoneResponse(response, true);
    trackMilestoneResponse(response, true);
    expect(track).toHaveBeenCalledExactlyOnceWith({ name: "FirstReceiptSaved", eventId: "first-receipt-id" }, true);
  });
  it("uses the shared trial-start ID for registration and respects consent", () => {
    const response = new Response(null, { headers: {
      "X-Receebo-Meta-Event": JSON.stringify({ name: "CompleteRegistration", eventId: "trial-start-id" }),
    } });
    trackMilestoneResponse(response, false);
    expect(track).not.toHaveBeenCalled();
    trackMilestoneResponse(response, true);
    expect(track).toHaveBeenCalledWith({ name: "CompleteRegistration", eventId: "trial-start-id" }, true);
  });
  it("ignores failed responses, unexpected events and malformed metadata", () => {
    for (const header of ["not-json", '{"name":"Purchase","eventId":"not-allowed"}']) {
      trackMilestoneResponse(new Response(null, { headers: { "X-Receebo-Meta-Event": header } }), true);
    }
    trackMilestoneResponse(new Response(null, { status: 500 }), true);
    expect(track).not.toHaveBeenCalled();
  });
  it("records the first open, emits on a later UTC day only, and scopes by account", () => {
    recordAuthenticatedOpen("test-account", true, new Date("2026-11-12T23:59:00Z"));
    recordAuthenticatedOpen("test-account", true, new Date("2026-11-12T23:59:59Z"));
    expect(track).not.toHaveBeenCalled();
    recordAuthenticatedOpen("test-account", true, new Date("2026-11-13T00:00:00Z"));
    recordAuthenticatedOpen("test-account", true, new Date("2026-11-13T12:00:00Z"));
    recordAuthenticatedOpen("another-test-account", true, new Date("2026-11-13T12:00:00Z"));
    expect(track).toHaveBeenCalledExactlyOnceWith({ name: "AppReturned", eventId: "return-event-id" }, true);
  });
  it("does not track or write a day without marketing consent", () => {
    recordAuthenticatedOpen("test-account", false, new Date("2026-11-12T12:00:00Z"));
    expect(localStorage.length).toBe(0);
    recordAuthenticatedOpen("test-account", true, new Date("2026-11-12T12:00:00Z"));
    recordAuthenticatedOpen("test-account", false, new Date("2026-11-13T12:00:00Z"));
    expect(track).not.toHaveBeenCalled();
    expect(localStorage.getItem("receebo:app-open:test-account")).toBe("2026-11-12");
  });
});

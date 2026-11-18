import { beforeEach, describe, expect, it, vi } from "vitest";
import { metaCapiConfigured, metaEventBody, sendMetaEvent } from "./metaCapi";
const mocks = vi.hoisted(() => ({ identifiers: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock("./adAttributionStore", () => ({ metaIdentifiersFor: mocks.identifiers }));
vi.mock("./logger", () => ({ logger: { info: mocks.info, warn: mocks.warn } }));
beforeEach(() => { vi.clearAllMocks(); mocks.identifiers.mockResolvedValue({}); });

describe("meta conversions api", () => {
  it.each([
    ["https://receebo.net/settings?search=private#receipt", "https://receebo.net/settings"],
    ["https://receebo.net/?checkout=success#private", "https://receebo.net/"],
    ["javascript:alert(1)", undefined],
    ["not a URL", undefined],
  ])("sanitizes source URL %s", (input, expected) => {
    const body = metaEventBody({ eventName: "Purchase", eventId: "safe", userId: "synthetic", eventSourceUrl: input });
    expect(body.data[0].event_source_url).toBe(expected);
  });
  it("stays inert when the pixel id or token is missing", async () => {
    expect(metaCapiConfigured({})).toBe(false);
    const fetchImpl = vi.fn();
    expect(await sendMetaEvent({
      eventName: "CompleteRegistration", eventId: "evt-1", userId: "user-1",
    }, fetchImpl as unknown as typeof fetch, {})).toEqual({ sent: false, reason: "unconfigured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ eventName: "CompleteRegistration", reason: "unconfigured" }, "Meta CAPI send failed");
  });

  it("sends the same event id the browser will use", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await sendMetaEvent({
      eventName: "Purchase", eventId: "evt-shared", userId: "user-1", value: 3.5, currency: "USD",
    }, fetchImpl as unknown as typeof fetch, { META_PIXEL_ID: "123", META_CAPI_ACCESS_TOKEN: "token", META_TEST_EVENT_CODE: "TEST1" });
    expect(result).toEqual({ sent: true });
    const body = metaEventBody({
      eventName: "Purchase", eventId: "evt-shared", userId: "user-1", value: 3.5, currency: "USD",
    }, "TEST1");
    expect(body.data[0].event_id).toBe("evt-shared");
    expect(body.data[0].custom_data).toEqual({ value: 3.5, currency: "USD" });
    expect(body.test_event_code).toBe("TEST1");
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown[])[1] && (fetchImpl.mock.calls[0][1] as { body: string }).body));
    expect(sent.data[0].event_id).toBe("evt-shared");
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain("/123/events");
  });
  it.each([400, 500])("logs only event and safe failure metadata for HTTP %i", async (status) => {
    const fetchImpl = vi.fn(async () => new Response("private upstream response", { status }));
    expect(await sendMetaEvent({ eventName: "FirstReceiptSaved", eventId: "private-event", userId: "private-user" },
      fetchImpl, { META_PIXEL_ID: "synthetic", META_CAPI_ACCESS_TOKEN: "private-token" }))
      .toEqual({ sent: false, reason: `http_${status}` });
    expect(mocks.warn).toHaveBeenCalledWith({ eventName: "FirstReceiptSaved", reason: `http_${status}`, httpStatus: status }, "Meta CAPI send failed");
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toMatch(/private/);
  });
  it("logs a successful event name only and uses stored matching identifiers", async () => {
    mocks.identifiers.mockResolvedValue({ fbc: "synthetic-stored-fbc", fbp: "synthetic-stored-fbp" });
    const request = vi.fn(async (_url: unknown, _options?: RequestInit) => new Response("{}"));
    await sendMetaEvent({ eventName: "CompleteRegistration", eventId: "event", userId: "user" },
      request, { META_PIXEL_ID: "synthetic", META_CAPI_ACCESS_TOKEN: "synthetic" });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).data[0].user_data.fbc).toBe("synthetic-stored-fbc");
    expect(mocks.info).toHaveBeenCalledWith({ eventName: "CompleteRegistration" }, "Meta CAPI sent");
  });
  it("prefers a supplied cookie identifier and logs no network exception details", async () => {
    mocks.identifiers.mockResolvedValue({ fbc: "stored" });
    const request = vi.fn(async (_url: unknown, _options?: RequestInit): Promise<Response> => { throw new Error("private-token"); });
    expect(await sendMetaEvent({ eventName: "Purchase", eventId: "event", userId: "user", fbc: "cookie" },
      request, { META_PIXEL_ID: "synthetic", META_CAPI_ACCESS_TOKEN: "synthetic" })).toEqual({ sent: false, reason: "network_error" });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).data[0].user_data.fbc).toBe("cookie");
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("private-token");
  });
});

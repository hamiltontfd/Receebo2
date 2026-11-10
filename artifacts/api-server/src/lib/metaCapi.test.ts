import { describe, expect, it, vi } from "vitest";
import { metaCapiConfigured, metaEventBody, sendMetaEvent } from "./metaCapi";

describe("meta conversions api", () => {
  it("stays inert when the pixel id or token is missing", async () => {
    expect(metaCapiConfigured({})).toBe(false);
    const fetchImpl = vi.fn();
    expect(await sendMetaEvent({
      eventName: "CompleteRegistration", eventId: "evt-1", userId: "user-1",
    }, fetchImpl as unknown as typeof fetch, {})).toEqual({ sent: false, reason: "unconfigured" });
    expect(fetchImpl).not.toHaveBeenCalled();
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
});

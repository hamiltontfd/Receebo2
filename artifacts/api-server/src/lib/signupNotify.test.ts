import { describe, expect, it, vi } from "vitest";
import {
  maskSignupEmail, formatSignupLisbon, signupNotifyMessage, signupNotifySkip,
  sendSignupNotification, notifyOnlyCreatedTrial, type SignupNotifyData,
} from "./signupNotify";

const data: SignupNotifyData = { at: new Date("2026-11-19T13:04:00Z"), email: "joao@gmail.com", market: "US", country: "US" };
const env = { NODE_ENV: "development", RESEND_API_KEY: "SYNTHETIC", SIGNUP_NOTIFY_EMAIL: "owner@example.invalid" };
describe("signup notification", () => {
  it.each([
    ["joao@gmail.com", "j***@g***.com"], ["j@gmail.com", "j***@g***.com"],
    ["joao@mail.example.co.uk", "j***@m***.uk"], ["", "-"], [undefined, "-"],
    ["invalid", "-"], ["a@@example.com", "-"], ["a@example", "-"], ["a@.com", "-"],
  ])("masks %s", (email, masked) => expect(maskSignupEmail(email)).toBe(masked));
  it("formats Lisbon winter time", () => expect(formatSignupLisbon(data.at)).toBe("19/11/2026 13:04 (Lisboa)"));
  it("formats Lisbon daylight saving", () => expect(formatSignupLisbon(new Date("2026-07-01T12:34:00Z"))).toBe("01/07/2026 13:34 (Lisboa)"));
  it("uses the DEV prefix everywhere except production", () => {
    expect(signupNotifyMessage(data, "production").subject).toBe("Novo cadastro no Receebo");
    expect(signupNotifyMessage(data, "development").subject).toBe("[DEV] Novo cadastro no Receebo");
    expect(signupNotifyMessage(data).subject).toBe("[DEV] Novo cadastro no Receebo");
  });
  it("contains only masked contact, minimal fields and a boolean fbclid", () => {
    const text = signupNotifyMessage({ ...data, hasFbclid: true, utmSource: "reddit\ninjection" }).text;
    expect(text).toContain("fbclid: sim");
    expect(text).toContain("Mercado: us");
    expect(text).toContain("utm_source: reddit injection");
    expect(text).toContain("E-mail: j***@g***.com");
    expect(text).not.toContain("joao@gmail.com");
    expect(signupNotifyMessage({ at: data.at }).text).toContain("fbclid: não");
    expect(signupNotifyMessage({ at: data.at }).text).toContain("Login provável: desconhecido");
    expect(signupNotifyMessage({ ...data, market: "PT" }).text).toContain("Mercado: eu");
    expect(signupNotifyMessage({ ...data, market: "BR" }).text).toContain("Mercado: br");
  });
  it("decides skips without secrets in the result", () => {
    expect(signupNotifySkip({})).toBe("unconfigured");
    expect(signupNotifySkip({ RESEND_API_KEY: "SYNTHETIC" })).toBe("recipient_unset");
    expect(signupNotifySkip(env)).toBeUndefined();
  });
  it.each(["unconfigured", "recipient_unset"] as const)("skips %s without contacting Resend", async reason => {
    const fetch = vi.fn();
    const warn = vi.fn();
    const result = await sendSignupNotification(data, {
      env: reason === "unconfigured" ? {} : { RESEND_API_KEY: "SYNTHETIC" }, fetch, warn,
    });
    expect(result).toEqual({ ok: false, reason });
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(reason);
  });
  it("sends plain text using the fixed verified sender", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"fixture-id"}'));
    expect(await sendSignupNotification({ ...data, hasFbclid: true }, { env, fetch })).toEqual({ ok: true, id: "fixture-id" });
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.from).toBe("Receebo <hello@receebo.net>");
    expect(payload.to).toBe(env.SIGNUP_NOTIFY_EMAIL);
    expect(payload.html).toBeUndefined();
    expect(payload.text).toContain("fbclid: sim");
    expect(payload.text).not.toContain("joao@gmail.com");
  });
  it("does not propagate Resend errors or log their raw messages", async () => {
    const warn = vi.fn();
    const fetch = vi.fn().mockResolvedValue(new Response("raw private provider message", { status: 400 }));
    expect(await sendSignupNotification(data, { env, fetch, warn })).toEqual({ ok: false, reason: "resend_error" });
    expect(warn).toHaveBeenCalledExactlyOnceWith("resend_error");
  });
  it("does not propagate network errors", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("private message"));
    expect(await sendSignupNotification(data, { env, fetch })).toEqual({ ok: false, reason: "network_error" });
  });
  it("aborts a slow Resend request", async () => {
    const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    expect(await sendSignupNotification(data, { env, fetch, timeoutMs: 5 })).toEqual({ ok: false, reason: "timeout" });
  });
  it("notifies only a newly inserted trial, without waiting or propagating errors", async () => {
    const notify = vi.fn(() => new Promise<void>(() => {}));
    expect(notifyOnlyCreatedTrial(false, notify)).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
    expect(notifyOnlyCreatedTrial(true, notify)).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(() => notifyOnlyCreatedTrial(true, () => { throw new Error("failure"); })).not.toThrow();
    notifyOnlyCreatedTrial(true, async () => { throw new Error("failure"); });
    await Promise.resolve();
  });
});

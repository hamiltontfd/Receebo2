import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("workbox-core", () => ({ clientsClaim: vi.fn() }));
vi.mock("workbox-precaching", () => ({ precacheAndRoute: vi.fn(), matchPrecache: vi.fn() }));
vi.mock("workbox-routing", () => ({ registerRoute: vi.fn() }));

const handlers = new Map<string, (event: any) => void>();
let skippedOnLoad = false;
const worker = {
  __WB_MANIFEST: [],
  registration: { scope: "https://example.test/receebo/", showNotification: vi.fn() },
  clients: { matchAll: vi.fn(), openWindow: vi.fn() },
  skipWaiting: vi.fn(),
  addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
};
beforeAll(async () => {
  vi.stubGlobal("self", worker);
  await import("../sw");
  skippedOnLoad = worker.skipWaiting.mock.calls.length > 0;
});
beforeEach(() => vi.clearAllMocks());
async function send(type: string, payload: object) {
  const work: Promise<unknown>[] = [];
  handlers.get(type)?.({ ...payload, waitUntil: (promise: Promise<unknown>) => work.push(promise) });
  await Promise.all(work);
}

describe("service worker update safety", () => {
  it("does not skip waiting when the worker is evaluated", () => {
    expect(skippedOnLoad).toBe(false);
  });
  it("accepts explicit updates from the only open window", async () => {
    worker.clients.matchAll.mockResolvedValue([{ id: "one" }]);
    const reply = vi.fn();
    await send("message", { data: { type: "APPLY_UPDATE" }, source: { id: "one" }, ports: [{ postMessage: reply }] });
    expect(reply).toHaveBeenCalledWith({ accepted: true });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
  it.each([[{ id: "one" }, { id: "two" }], []])("refuses activation with unsafe window counts (%j)", async (...windows) => {
    worker.clients.matchAll.mockResolvedValue(windows);
    const reply = vi.fn();
    await send("message", { data: { type: "APPLY_UPDATE" }, source: { id: "one" }, ports: [{ postMessage: reply }] });
    expect(reply).toHaveBeenCalledWith({ accepted: false });
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });
  it("ignores legacy/automatic skip-waiting messages", async () => {
    await send("message", { data: { type: "SKIP_WAITING" } });
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });
});
describe("preserved notification deep links", () => {
  it("includes the artifact scope and receipt in the notification", async () => {
    await send("push", { data: { json: () => ({ title: "Return reminder", receiptId: 42 }) } });
    expect(worker.registration.showNotification).toHaveBeenCalledWith("Return reminder", expect.objectContaining({
      icon: "https://example.test/receebo/icons/icon-192.png",
      data: { receiptId: 42 },
    }));
  });
  it("opens a scoped receipt when no window exists", async () => {
    worker.clients.matchAll.mockResolvedValue([]);
    await send("notificationclick", { notification: { close: vi.fn(), data: { receiptId: 42 } } });
    expect(worker.clients.openWindow).toHaveBeenCalledWith("https://example.test/receebo/receipts/42");
  });
  it("focuses and navigates an existing window", async () => {
    const client = { focus: vi.fn(), navigate: vi.fn() };
    worker.clients.matchAll.mockResolvedValue([client]);
    await send("notificationclick", { notification: { close: vi.fn(), data: { receiptId: 42 } } });
    expect(client.navigate).toHaveBeenCalledWith("https://example.test/receebo/receipts/42");
    expect(client.focus).toHaveBeenCalledOnce();
  });
});

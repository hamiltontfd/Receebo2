import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waiting: {} as ServiceWorker | null,
  requestUpdate: vi.fn(async () => false),
}));
vi.mock("@/lib/pwa", async (original) => ({
  ...await original<typeof import("@/lib/pwa")>(),
  getWaitingWorker: () => mocks.waiting,
  requestUpdate: mocks.requestUpdate,
}));
import PwaStatus from "./PwaStatus";
import { usePwaUpdateBlocker } from "@/lib/pwa";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.waiting = {} as ServiceWorker;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true, value: new EventTarget(),
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});
function Work({ active }: { active: boolean }) {
  usePwaUpdateBlocker(active);
  return null;
}
function mount(active = false, client = new QueryClient()) {
  const tree = (work: boolean) => <QueryClientProvider client={client}><Router>
    <Work active={work} /><PwaStatus />
  </Router></QueryClientProvider>;
  const result = render(tree(active));
  return { ...result, changeWork: (work: boolean) => result.rerender(tree(work)) };
}
it("waits for explicit approval and never applies an update merely because it exists", () => {
  mount();
  expect(screen.getByRole("button", { name: "Update now" })).toBeEnabled();
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});
it("blocks camera, conversion, uploads and unsaved edits until work ends", () => {
  const result = mount(true);
  expect(screen.getByRole("button", { name: "Update now" })).toBeDisabled();
  result.changeWork(false);
  expect(screen.getByRole("button", { name: "Update now" })).toBeEnabled();
});
it("blocks any pending server mutation, including uploads and billing", async () => {
  const client = new QueryClient();
  let finish!: () => void;
  const mutation = client.getMutationCache().build(client, {
    mutationFn: () => new Promise<void>((resolve) => { finish = resolve; }),
  });
  let pending!: Promise<void>;
  await act(async () => { pending = mutation.execute(undefined); });
  mount(false, client);
  expect(screen.getByRole("button", { name: "Update now" })).toBeDisabled();
  await act(async () => { finish(); await pending; });
});
it("does not activate while offline", () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  expect(screen.getByRole("button", { name: "Update now" })).toBeDisabled();
});
it("explains the other-window guard instead of forcing activation", async () => {
  mount();
  await act(async () => screen.getByRole("button", { name: "Update now" }).click());
  expect(mocks.requestUpdate).toHaveBeenCalledOnce();
  expect(screen.getByText(/Close other Receebo tabs or windows, then try again/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Update now" })).toBeEnabled();
});

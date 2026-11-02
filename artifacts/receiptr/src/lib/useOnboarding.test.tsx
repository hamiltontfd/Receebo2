import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingProvider, useOnboarding } from "./useOnboarding";
import { OnboardingCard } from "@/components/OnboardingCard";
import type { AccountOnboarding } from "@workspace/api-client-react";

const mocks = vi.hoisted(() => ({
  auth: { userId: "A" as string | null, isLoaded: true, isSignedIn: true },
  request: vi.fn(),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: (...args: unknown[]) => mocks.request(...args) }));
vi.mock("@/lib/locale", () => ({ useAppLocale: () => "en" }));
vi.mock("@/lib/appCopy", () => ({ appText: (s: string) => s }));
const blank: AccountOnboarding = { receiptDone: false, searchDone: false, completed: false, dismissed: false };
let accounts: Record<string, AccountOnboarding>;
function Probe() {
  const state = useOnboarding();
  return <>
    <output data-testid="state">{JSON.stringify(state)}</output>
    <button onClick={state.markSearchDone}>Search action</button>
    <OnboardingCard {...state} onFocusSearch={() => {}} />
  </>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 1 } } });
  const tree = (page = true) => <QueryClientProvider client={client}>
    <OnboardingProvider>{page ? <Probe /> : <p>Other route</p>}</OnboardingProvider>
  </QueryClientProvider>;
  const result = render(tree());
  return { ...result, client, page: (value: boolean) => result.rerender(tree(value)), rerenderSession: () => result.rerender(tree()) };
}
function state() { return JSON.parse(screen.getByTestId("state").textContent!); }
function writes() { return mocks.request.mock.calls.filter(([, init]) => init.method === "PATCH"); }
beforeEach(() => {
  localStorage.clear();
  mocks.auth = { userId: "A", isLoaded: true, isSignedIn: true };
  accounts = { A: { ...blank }, B: { ...blank } };
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (_url, init) => {
    const id = init.headers["X-Onboarding-Account"];
    if (init.method === "PATCH") {
      const patch = JSON.parse(init.body);
      accounts[id] = {
        ...accounts[id], searchDone: accounts[id].searchDone || !!patch.searchDone,
        dismissed: accounts[id].dismissed || !!patch.dismissed,
        completed: accounts[id].completed || (accounts[id].receiptDone && !!patch.searchDone),
      };
    }
    return { ...accounts[id] };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("account onboarding UI and persistence", () => {
  it("hides through auth and slow hydration, with no celebration for completed accounts", async () => {
    mocks.auth.isLoaded = false;
    const view = mount();
    expect(screen.queryByText("Getting started")).toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
    let resolve!: (data: AccountOnboarding) => void;
    mocks.request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    mocks.auth.isLoaded = true;
    view.rerenderSession();
    expect(screen.queryByText("Getting started")).toBeNull();
    await act(async () => resolve({ ...blank, receiptDone: true, searchDone: true, completed: true }));
    await waitFor(() => expect(state()).toMatchObject({ ready: true, allDone: true, celebrating: false, visible: false }));
    expect(screen.queryByText("Getting started")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("keeps the card hidden on failed reads; recovers only after a successful read", async () => {
    mocks.request.mockRejectedValue(new Error("offline"));
    const { client } = mount();
    await waitFor(() => expect(client.getQueryState(["account-onboarding", "A"])?.status).toBe("error"));
    expect(state()).toMatchObject({ ready: false, visible: false });
    mocks.request.mockResolvedValue({ ...blank });
    await act(async () => { await client.refetchQueries(); });
    expect(await screen.findByText("Getting started")).toBeTruthy();
  });
  it("shows genuinely new accounts; ignores ambiguous legacy flags", async () => {
    localStorage.setItem("receebo:onboarding:searchDone", "true");
    localStorage.setItem("receebo:onboarding:dismissed", "true");
    mount();
    await screen.findByText("Getting started");
    expect(state()).toMatchObject({ step1Done: false, step2Done: false, dismissed: false });
    fireEvent.click(screen.getByText("Search action"));
    expect(writes()).toHaveLength(0);
  });
  it("sends completion before the animation ends, survives navigation and an independent empty client", async () => {
    accounts.A.receiptDone = true;
    const view = mount();
    await screen.findByText("Getting started");
    fireEvent.click(screen.getByText("Search action"));
    expect(state()).toMatchObject({ allDone: true, celebrating: true });
    await waitFor(() => expect(accounts.A.completed).toBe(true));
    view.page(false); // Leave before the two-second animation.
    view.unmount();
    localStorage.clear();
    mount();
    await waitFor(() => expect(state().ready).toBe(true));
    expect(state()).toMatchObject({ allDone: true, visible: false, celebrating: false });
  });
  it("remembers X across independent clients, without marking the steps complete", async () => {
    const first = mount();
    await screen.findByText("Getting started");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss onboarding" }));
    expect(screen.queryByText("Getting started")).toBeNull();
    await waitFor(() => expect(accounts.A.dismissed).toBe(true));
    first.unmount();
    localStorage.clear();
    mount();
    await waitFor(() => expect(state().ready).toBe(true));
    expect(state()).toMatchObject({ dismissed: true, allDone: false, visible: false });
  });
  it("does not share progress or in-flight reads on account switches", async () => {
    accounts.A = { ...blank, dismissed: true };
    let resolve!: (value: AccountOnboarding) => void;
    mocks.request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = mount();
    mocks.auth.userId = "B";
    view.rerenderSession();
    await screen.findByText("Getting started");
    await act(async () => resolve(accounts.A));
    expect(state()).toMatchObject({ dismissed: false, visible: true });
    mocks.auth.userId = "A";
    view.rerenderSession();
    expect(screen.queryByText("Getting started")).toBeNull();
    await waitFor(() => expect(state().dismissed).toBe(true));
  });
  it("journals failed writes and retries after route unmount and reload", async () => {
    const server = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((url, init) =>
      init.method === "PATCH" ? Promise.reject(new Error("offline")) : server(url, init));
    const first = mount();
    await screen.findByText("Getting started");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss onboarding" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    first.page(false);
    expect(localStorage.getItem("receebo:onboarding:pending:A")).toContain('"dismissed":true');
    first.unmount();
    mocks.request.mockImplementation(server);
    const second = mount();
    expect(screen.queryByText("Getting started")).toBeNull();
    await waitFor(() => expect(accounts.A.dismissed).toBe(true));
    expect(localStorage.getItem("receebo:onboarding:pending:A")).toBeNull();
    second.unmount();
  });
  it("retries a failed write on reconnection without leaking it to a different account", async () => {
    const server = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((url, init) =>
      init.method === "PATCH" ? Promise.reject(new Error("offline")) : server(url, init));
    const view = mount();
    await screen.findByText("Getting started");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss onboarding" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    mocks.auth.userId = "B";
    view.rerenderSession();
    await screen.findByText("Getting started");
    mocks.request.mockImplementation(server);
    fireEvent(window, new Event("online"));
    expect(accounts.B.dismissed).toBe(false);
    mocks.auth.userId = "A";
    view.rerenderSession();
    await waitFor(() => expect(accounts.A.dismissed).toBe(true));
    expect(accounts.B.dismissed).toBe(false);
  });
});

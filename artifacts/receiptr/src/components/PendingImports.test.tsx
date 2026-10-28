import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  navigate: vi.fn(),
  mailStatus: undefined as unknown,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("@/components/MailConnections", () => ({ useMailStatus: () => ({ data: mocks.mailStatus }) }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: () => new Promise(() => {}) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/search", mocks.navigate],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import PendingImports from "./PendingImports";
import { BILLING_QUERY_KEY } from "@/hooks/useBilling";
import { TRIAL_CAP_MESSAGE } from "@/lib/trialCopy";

const make = (id: number, over: Record<string, unknown> = {}) => ({
  id, provider: "outlook", gmailMessageId: `m${id}`, originalFileName: "r.pdf", merchant: `Store ${id}`,
  total: 19.99, currency: "EUR", purchaseDate: "2026-10-20", category: "Electronics", summary: null,
  createdAt: new Date().toISOString(), itemCount: 2, firstItemName: "Soundbar 3.1 Dolby Atmos", productCount: 2,
  notableCount: 0, ...over,
});
const item = make(7, { merchant: "Worten", category: null, firstItemName: null, productCount: 0 });
const outlookConnected = {
  providers: [{ id: "outlook", label: "Outlook", enabled: true, connected: true, needsReconnect: false }],
};

function mount(
  billing: Record<string, unknown>,
  approveResponse: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: { approved: true, receiptId: 1 } },
  items: unknown[] = [item],
) {
  let list = items;
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/approve") && init?.method === "POST") {
      if (approveResponse.ok) list = list.filter((i: any) => !url.includes(`/${i.id}/approve`));
      return { ok: approveResponse.ok, status: approveResponse.status, json: async () => approveResponse.body };
    }
    if (url.includes("/always-import") && init?.method === "POST") {
      const key = decodeURIComponent(url.split("/recurring-suppliers/")[1]!.split("/")[0]!);
      const mine: any[] = list.filter((i: any) => i.recurring?.supplierKey === key);
      list = list.filter((i: any) => i.recurring?.supplierKey !== key);
      return {
        ok: true, status: 200,
        json: async () => ({
          supplier: { supplierKey: key, displayName: mine[0]?.recurring.displayName, status: "on" },
          approved: mine.map((i: any, n: number) => ({ id: i.id, receiptId: 100 + n })), skipped: [],
        }),
      };
    }
    if (init?.method === "DELETE") {
      list = list.filter((i: any) => !url.endsWith(`/${i.id}`));
      return { ok: true, status: 200, json: async () => ({ dismissed: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ items: list, count: list.length, totals: [] }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(BILLING_QUERY_KEY, billing);
  render(<QueryClientProvider client={client}><PendingImports /></QueryClientProvider>);
  return fetchMock;
}

const paid = { plan: "pro", accessState: "active", canUseApp: true, canUpload: true };

afterEach(() => { vi.unstubAllGlobals(); mocks.toast.mockReset(); mocks.mailStatus = undefined; });

describe("Home 'Found in your email' card", () => {
  it("shows only the top-ranked item, the total badge, View all and stacked edges", async () => {
    mount(paid, undefined, [make(3, { merchant: "Casa Lumen" }), make(4, { merchant: "Atelier" }), make(5)]);
    expect(await screen.findByText("Casa Lumen")).toBeInTheDocument();
    expect(screen.queryByText("Atelier")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-count-badge")).toHaveTextContent("3");
    const viewAll = screen.getByTestId("link-view-all-imports");
    expect(viewAll).toHaveAttribute("href", "/imports");
    expect(viewAll).toHaveTextContent(/^View all$/);
    expect(screen.getByTestId("pending-stack-edges")).toBeInTheDocument();
    expect(screen.getByText("Soundbar 3.1 Dolby Atmos + 1 more")).toBeInTheDocument();
    // No "Outlook · Found X ago" line on home cards (the section header says it).
    expect(screen.queryByText(/Found .* ago/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("pending-home-card")).toHaveLength(1);
  });

  it("with one pending item hides View all and the stacked edges", async () => {
    mount(paid, undefined, [make(3)]);
    expect(await screen.findByTestId("pending-home-card")).toBeInTheDocument();
    expect(screen.getByTestId("pending-count-badge")).toHaveTextContent("1");
    expect(screen.queryByTestId("link-view-all-imports")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-stack-edges")).not.toBeInTheDocument();
  });

  it("with nothing pending keeps a compact 'all caught up' line for connected mailboxes", async () => {
    mocks.mailStatus = outlookConnected;
    mount(paid, undefined, []);
    expect(await screen.findByTestId("pending-caught-up")).toHaveTextContent(
      "You're all caught up. New receipts from Outlook will show up here.",
    );
    expect(screen.getByText("Found in your email")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-count-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-view-all-imports")).not.toBeInTheDocument();
  });

  it("renders nothing when no mailbox is connected and nothing is pending", async () => {
    const fetchMock = mount(paid, undefined, []);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("pending-imports")).not.toBeInTheDocument();
  });

  it("Accept saves right away with a toast and the next card comes in", async () => {
    const fetchMock = mount(paid, undefined, [make(3, { merchant: "First" }), make(4, { merchant: "Second" })]);
    fireEvent.click(await screen.findByTitle("Add to library"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Receipt added to your library" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
    const approveCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/3/approve"));
    expect(JSON.parse(String(approveCall![1].body))).toEqual({});
  });

  it("Dismiss shows the 'Dismissed' toast", async () => {
    mount(paid, undefined, [make(3, { merchant: "First" }), make(4, { merchant: "Second" })]);
    fireEvent.click(await screen.findByTitle("Dismiss"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Dismissed" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
  });

  it("tapping the card body opens the pending sheet", async () => {
    mount(paid, undefined, [make(3, { merchant: "Casa Lumen" })]);
    fireEvent.click(await screen.findByTestId("pending-card-open"));
    expect(await screen.findByTestId("pending-sheet")).toBeInTheDocument();
  });
});

describe("PendingImports at the free-trial cap", () => {
  it("shows the cap notice with Subscribe and disables approving a 6th receipt", async () => {
    const fetchMock = mount(
      { plan: "free", accessState: "trial_exhausted", canUseApp: true, canUpload: false, trialUploadsUsed: 5 },
      { ok: true, status: 200, body: { approved: true, receiptId: 1 } },
    );
    expect(await screen.findByTestId("pending-trial-cap")).toHaveTextContent(TRIAL_CAP_MESSAGE);
    expect(screen.getByTestId("link-pending-subscribe")).toHaveTextContent("Subscribe");
    expect(screen.getByTestId("link-pending-subscribe").getAttribute("href")).toBe("/settings#upgrade-plans");
    const approve = screen.getByTitle(TRIAL_CAP_MESSAGE);
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/approve"), expect.anything());
  });

  it("shows the cap message with a Subscribe action when the server refuses the approval", async () => {
    mount(
      { plan: "trialing", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 1 },
      { ok: false, status: 403, body: { error: "subscription_required", code: "trial_exhausted", message: TRIAL_CAP_MESSAGE } },
    );
    fireEvent.click(await screen.findByTitle("Add to library"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: TRIAL_CAP_MESSAGE, variant: "destructive", action: expect.anything(),
    })));
  });
});

describe("PendingImports while a mailbox sync holds the lock", () => {
  it("shows a neutral 'still syncing' toast and keeps the item", async () => {
    mount(paid, { ok: false, status: 409, body: { error: "busy", code: "SYNC_IN_PROGRESS" } });
    fireEvent.click(await screen.findByTitle("Add to library"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: "Still syncing your email — try again in a minute",
    }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(within(screen.getByTestId("pending-home-card")).getByText("Worten")).toBeInTheDocument();
  });

  it("refreshes the list instead of showing an error when the import was already handled", async () => {
    const fetchMock = mount(paid, { ok: false, status: 409, body: { error: "Pending import was already handled" } });
    fireEvent.click(await screen.findByTitle("Add to library"));
    const pendingCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("api/mail/pending?meta=1")).length;
    await waitFor(() => expect(pendingCalls()).toBeGreaterThanOrEqual(2));
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe("Home card for an undecided recurring supplier", () => {
  const edp = (id: number, pendingCount: number) => make(id, {
    merchant: "EDP Comercial", category: "Home",
    recurring: { supplierKey: "edp", displayName: "EDP Comercial", kind: "utility", category: "Home", status: "undecided", pendingCount },
  });

  it("shows the slim banner (title only) and Dismiss / Always import, no Accept", async () => {
    mount(paid, undefined, [edp(1, 3), make(2), edp(3, 3), edp(4, 3)]);
    const banner = await screen.findByTestId("pending-recurring-banner");
    expect(banner).toHaveTextContent(/^EDP Comercial looks like a recurring bill$/);
    const card = screen.getByTestId("pending-home-card");
    expect(within(card).getByRole("button", { name: /Dismiss/ })).toBeInTheDocument();
    expect(within(card).getByTestId("pending-card-always-import")).toHaveTextContent("Always import");
    expect(within(card).queryByRole("button", { name: /^Accept$/ })).not.toBeInTheDocument();
  });

  it("Always import accepts all its pending receipts: badge drops by n+1, toast with Manage", async () => {
    const fetchMock = mount(paid, undefined, [edp(1, 3), make(2), edp(3, 3), edp(4, 3), make(5)]);
    await screen.findByTestId("pending-recurring-banner");
    expect(screen.getByTestId("pending-count-badge")).toHaveTextContent("5");
    fireEvent.click(screen.getByTestId("pending-card-always-import"));
    await waitFor(() => expect(screen.getByTestId("pending-count-badge")).toHaveTextContent("2"));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/always-import"))!;
    expect(call[0]).toContain("/api/mail/recurring-suppliers/edp/always-import");
    expect(JSON.parse(String(call[1].body))).toEqual({ id: 1 });
    const t = mocks.toast.mock.calls.at(-1)![0];
    expect(t.title).toBe("EDP Comercial receipts will now import automatically");
    expect(t.description).toBe("3 added");
    render(t.action);
    fireEvent.click(screen.getByTestId("toast-action-manage"));
    expect(mocks.navigate).toHaveBeenCalledWith("/profile/recurring");
  });

  it("a decided (off) supplier keeps the normal Accept card", async () => {
    mount(paid, undefined, [make(1, { recurring: { supplierKey: "edp", displayName: "EDP", kind: "utility", category: "Home", status: "off", pendingCount: 1 } })]);
    await screen.findByTestId("pending-home-card");
    expect(screen.queryByTestId("pending-recurring-banner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Accept$/ })).toBeInTheDocument();
  });
});

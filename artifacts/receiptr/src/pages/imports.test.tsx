import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), navigate: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/MailConnections", () => ({
  useMailStatus: () => ({ data: { providers: [{ id: "outlook", label: "Outlook", enabled: true, connected: true }] } }),
}));
vi.mock("@workspace/api-client-react", () => ({ customFetch: () => new Promise(() => {}) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/imports", mocks.navigate],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import ImportsPage from "./imports";
import { BILLING_QUERY_KEY } from "@/hooks/useBilling";

const make = (id: number, over: Record<string, unknown> = {}) => ({
  id, provider: "outlook", gmailMessageId: `m${id}`, originalFileName: "r.pdf", merchant: `Store ${id}`,
  total: 50, currency: "EUR", purchaseDate: "2026-10-20", category: "Electronics", summary: null,
  createdAt: new Date().toISOString(), itemCount: 1, firstItemName: "Thing", productCount: 1, notableCount: 0, ...over,
});
const ITEMS = [
  make(1, { merchant: "Casa Lumen", total: 349, purchaseDate: "2026-10-25" }),
  make(2, { merchant: "Casa & Jardim", total: 189.9, purchaseDate: "2026-10-22", category: "Home" }),
  make(3, { merchant: "Sala Aurora", total: 18.4, purchaseDate: "2026-10-24", category: "Entertainment" }),
  make(4, { merchant: "Mercado Verde", total: 12.35, purchaseDate: "2026-09-20", category: "Groceries" }),
];

function mount(billing: Record<string, unknown>) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("bulk-approve")) {
      const { ids } = JSON.parse(String(init!.body));
      return { ok: true, status: 200, json: async () => ({ approved: ids.slice(0, 2).map((id: number) => ({ id, receiptId: id })), skipped: ids.slice(2), notFound: [], code: ids.length > 2 ? "TRIAL_UPLOAD_LIMIT" : undefined }) };
    }
    if (url.includes("bulk-dismiss")) {
      const { ids } = JSON.parse(String(init!.body));
      return { ok: true, status: 200, json: async () => ({ dismissed: ids, failed: [], notFound: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({ items: ITEMS, count: ITEMS.length, totals: [] }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(BILLING_QUERY_KEY, billing);
  render(<QueryClientProvider client={client}><ImportsPage /></QueryClientProvider>);
  return fetchMock;
}
const paid = { plan: "pro", accessState: "paid", canUseApp: true, canUpload: true };

afterEach(() => { vi.unstubAllGlobals(); mocks.toast.mockReset(); });

describe("/imports", () => {
  it("groups by month with a count and total per month", async () => {
    mount(paid);
    const october = await screen.findByTestId("month-2026-10");
    expect(within(october).getByText("October 2026")).toBeInTheDocument();
    expect(october).toHaveTextContent("3 items · €557.30");
    expect(screen.getByTestId("month-2026-09")).toHaveTextContent("1 item · €12.35");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Found in your email (4)");
  });

  it("selects items and accepts the selection in one bulk call", async () => {
    const fetchMock = mount(paid);
    fireEvent.click(await screen.findByRole("button", { name: /Select/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Casa Lumen" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Sala Aurora" }));
    expect(screen.getByTestId("selected-count")).toHaveTextContent("2 selected");
    expect(screen.getByTestId("accept-selected")).toHaveTextContent("Accept selected (2)");
    fireEvent.click(screen.getByTestId("accept-selected"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "2 receipts added" }));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("bulk-approve"));
    // Server ranking order is kept.
    expect(JSON.parse(String(call![1].body))).toEqual({ ids: [1, 3] });
  });

  it("on the trial offers 'Accept up to N' and explains the rest stay", async () => {
    mount({ plan: "trialing", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 2 });
    fireEvent.click(await screen.findByRole("button", { name: /Select/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByTestId("accept-selected")).toHaveTextContent("Accept up to 2");
    expect(screen.getByTestId("trial-slots-note")).toHaveTextContent("Trial: 2 of 5 receipts left. The rest stay here.");
    fireEvent.click(screen.getByTestId("accept-selected"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "2 receipts added", description: "Subscribe to add the other 2. They stay here.",
    })));
  });

  it("'Dismiss under €20' lists the items and their total before a red confirm", async () => {
    const fetchMock = mount(paid);
    fireEvent.click(await screen.findByTestId("dismiss-under-20"));
    const list = await screen.findByTestId("dismiss-under-list");
    expect(within(list).getByText("Sala Aurora")).toBeInTheDocument();
    expect(within(list).getByText("Mercado Verde")).toBeInTheDocument();
    expect(within(list).queryByText("Casa Lumen")).not.toBeInTheDocument();
    expect(screen.getByText(/They add up to €30.75/)).toBeInTheDocument();
    const confirm = screen.getByTestId("confirm-dismiss-under");
    expect(confirm).toHaveTextContent("Dismiss 2");
    expect(confirm.className).toContain("bg-[#DC2626]");
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Dismissed 2" }));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("bulk-dismiss"));
    expect(JSON.parse(String(call![1].body))).toEqual({ ids: [3, 4] });
  });
});

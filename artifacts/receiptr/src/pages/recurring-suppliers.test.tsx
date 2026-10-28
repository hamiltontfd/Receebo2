import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), mailStatus: undefined as unknown }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/MailConnections", () => ({ useMailStatus: () => ({ data: mocks.mailStatus }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/profile/recurring", vi.fn()],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import RecurringSuppliersPage, { EmailImportsSection, formatSupplierDate } from "./recurring-suppliers";

const supplier = (over: Record<string, unknown>) => ({
  supplierKey: "netflix", displayName: "Netflix", kind: "subscription", category: "Entertainment", status: "on",
  receiptCount: 8, lastReceiptDate: "2026-10-21", lastAmount: 13.99, lastCurrency: "EUR", pendingCount: 0, ...over,
});

function mount(ui: React.ReactElement, suppliers: unknown[]) {
  let list = suppliers as Array<Record<string, unknown>>;
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const key = url.split("/recurring-suppliers/")[1];
      const status = JSON.parse(String(init.body)).status;
      list = list.map((s) => (s.supplierKey === key ? { ...s, status } : s));
      return { ok: true, status: 200, json: async () => ({ supplier: list.find((s) => s.supplierKey === key) }) };
    }
    return { ok: true, status: 200, json: async () => ({ suppliers: list }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); mocks.toast.mockReset(); mocks.mailStatus = undefined; });

describe("/profile/recurring", () => {
  it("lists suppliers on first, then by most recent receipt, with type, count, last date and amount", async () => {
    mount(<RecurringSuppliersPage />, [
      supplier({ supplierKey: "edp", displayName: "EDP Comercial", kind: "utility", category: "Home", status: "off", lastReceiptDate: "2026-10-25", lastAmount: 61.2 }),
      supplier({ supplierKey: "spotify", displayName: "Spotify", status: "on", lastReceiptDate: "2026-09-30", receiptCount: 1, lastAmount: 10.99 }),
      supplier({}),
    ]);
    const list = await screen.findByTestId("recurring-list");
    const rows = within(list).getAllByTestId(/^recurring-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["recurring-row-netflix", "recurring-row-spotify", "recurring-row-edp"]);
    expect(rows[0]).toHaveTextContent("Subscription · 8 receipts");
    expect(rows[0]).toHaveTextContent("Last Oct 21, 2026 · €13.99");
    expect(rows[1]).toHaveTextContent("Subscription · 1 receipt");
    expect(rows[2]).toHaveTextContent("Utility bill · Not importing");
    expect(rows[2].querySelector(".opacity-50")).not.toBeNull();
    expect(screen.getByText("Recurring suppliers", { selector: "h1" })).toBeInTheDocument();
    expect(screen.getByText("Approve a subscription or bill once and its receipts import automatically.")).toBeInTheDocument();
    expect(screen.getByText("Off stops new receipts from that supplier. Receipts already in your library stay.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Profile/ })).toHaveAttribute("href", "/profile");
  });

  it("switching off and on sends the decision and shows the toasts", async () => {
    const fetchMock = mount(<RecurringSuppliersPage />, [supplier({})]);
    fireEvent.click(await screen.findByTestId("recurring-switch-netflix"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: "Stopped importing from Netflix", description: "Turn it back on here anytime.",
    }));
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT")!;
    expect(put[0]).toContain("/api/mail/recurring-suppliers/netflix");
    expect(JSON.parse(String(put[1].body))).toEqual({ status: "off" });
    await waitFor(() => expect(screen.getByTestId("recurring-row-netflix")).toHaveTextContent("Not importing"));
    fireEvent.click(screen.getByTestId("recurring-switch-netflix"));
    await waitFor(() => expect(mocks.toast).toHaveBeenLastCalledWith({ title: "Netflix receipts will now import automatically" }));
  });

  it("empty state", async () => {
    mount(<RecurringSuppliersPage />, []);
    expect(await screen.findByTestId("recurring-empty")).toHaveTextContent(
      "No recurring suppliers yet. When we spot a subscription or bill in your email, you can approve it once here.",
    );
  });

  it("formats date-only values on their calendar day", () => {
    expect(formatSupplierDate("2026-10-21")).toBe("Oct 21, 2026");
    expect(formatSupplierDate(null)).toBeNull();
  });
});

describe("Profile 'Email imports' section", () => {
  it("hidden with no mailbox and no suppliers", async () => {
    const fetchMock = mount(<EmailImportsSection />, []);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("profile-email-imports")).not.toBeInTheDocument();
  });

  it("shows the count and links to /profile/recurring when a mailbox is connected", async () => {
    mocks.mailStatus = { providers: [{ id: "outlook", enabled: true, connected: true }] };
    mount(<EmailImportsSection />, [supplier({}), supplier({ supplierKey: "edp" })]);
    const row = await screen.findByTestId("link-recurring-suppliers");
    expect(screen.getByText("Email imports")).toBeInTheDocument();
    await waitFor(() => expect(row).toHaveTextContent("Recurring suppliers2"));
    expect(row.closest("a")).toHaveAttribute("href", "/profile/recurring");
  });

  it("shows with suppliers even without a connected mailbox", async () => {
    mount(<EmailImportsSection />, [supplier({})]);
    expect(await screen.findByTestId("profile-email-imports")).toBeInTheDocument();
  });
});

import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listReceipts: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  listReceipts: mocks.listReceipts,
  getListReceiptsQueryKey: () => ["/api/receipts"],
}));
vi.mock("@/components/ReceiptSheet", () => ({ ReceiptSheet: () => null }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import StatsPage from "./stats";

const base = { objectPath: "/o", contentType: "image/jpeg", status: "completed", createdAt: "2026-10-20T10:00:00Z", currency: "EUR", purchaseCountry: "PT", category: "Electronics" };
const r = (id: number, over: Record<string, unknown>) => ({ ...base, id, originalFileName: `r${id}.jpg`, merchant: `Store ${id}`, ...over });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><StatsPage /></QueryClientProvider>);
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 29, 9)); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("/stats", () => {
  it("pages through every receipt and shows the dashboard from real data", async () => {
    mocks.listReceipts
      .mockResolvedValueOnce({
        items: [
          r(1, { purchaseDate: "2026-10-20", isOnlinePurchase: true, total: 649, notableItems: [{ name: "Smart TV", price: 599, reason: "" }] }),
          r(2, { purchaseDate: "2024-01-10", isOnlinePurchase: false, total: 229, category: "Home" }),
        ],
        nextCursor: "c2",
      })
      .mockResolvedValueOnce({
        items: [
          r(3, { purchaseType: "subscription", purchaseDate: "2026-10-01", total: 9.99 }),
          r(4, { purchaseDate: null, total: 142.5 }),
        ],
        nextCursor: null,
      });
    mount();
    expect(await screen.findByTestId("stats-total")).toHaveTextContent("€878.00");
    expect(mocks.listReceipts).toHaveBeenCalledTimes(2);
    expect(mocks.listReceipts).toHaveBeenLastCalledWith({ limit: 50, cursor: "c2" });
    const groups = screen.getByTestId("stats-groups");
    expect(within(groups).getByTestId("stats-group-return")).toHaveTextContent("Return window1€649.00");
    expect(within(groups).getByTestId("stats-group-warranty")).toHaveTextContent("Warranty1€229.00");
    expect(within(groups).getByTestId("stats-group-unknown")).toHaveTextContent("Unknown deadline1 · not counted€142.50");
    expect(screen.getByTestId("stats-chart-total")).toHaveTextContent("€878.00");
    const soon = screen.getByTestId("stats-expiring");
    expect(within(soon).getAllByTestId("stats-row-deadline").map((n) => n.textContent)).toEqual(["Return by 3 Nov", "Warranty to 10 Jan 2027"]);
    expect(within(screen.getByTestId("stats-worth-keeping")).getByText("Smart TV")).toBeInTheDocument();
    expect(screen.getAllByTestId("stats-exclusion-note")[0]).toHaveTextContent("Subscriptions, services and tickets aren't counted.");
    fireEvent.click(screen.getByText("30"));
    expect(screen.getByTestId("stats-chart-total")).toHaveTextContent("€649.00");
  });
  it("shows the empty card with no receipts", async () => {
    mocks.listReceipts.mockResolvedValueOnce({ items: [], nextCursor: null });
    mount();
    expect(await screen.findByTestId("stats-empty")).toHaveTextContent("Nothing protected yet");
    expect(screen.getByText("Scan a receipt").closest("a")).toHaveAttribute("href", "/scan");
  });
  it("says so when only subscriptions or services exist", async () => {
    mocks.listReceipts.mockResolvedValueOnce({ items: [r(3, { purchaseType: "service", purchaseDate: "2026-10-01", total: 30 })], nextCursor: null });
    mount();
    expect(await screen.findByTestId("stats-no-dated")).toHaveTextContent("No purchases with a return window or warranty yet.");
  });
});

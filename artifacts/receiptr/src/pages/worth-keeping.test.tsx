import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listReceipts: vi.fn(), sheet: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  listReceipts: mocks.listReceipts,
  getListReceiptsQueryKey: () => ["/api/receipts"],
}));
vi.mock("@/components/ReceiptSheet", () => ({
  ReceiptSheet: ({ receiptId }: { receiptId: number | null }) => { mocks.sheet(receiptId); return null; },
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import WorthKeepingPage from "./worth-keeping";

const base = { objectPath: "/o", contentType: "image/jpeg", status: "completed", createdAt: "2026-10-20T10:00:00Z", currency: "EUR", purchaseCountry: "PT", category: "Electronics" };
const r = (id: number, over: Record<string, unknown>) => ({ ...base, id, originalFileName: `r${id}.jpg`, merchant: `Store ${id}`, ...over });
const n = (name: string, price: number) => [{ name, price, reason: "" }];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><WorthKeepingPage /></QueryClientProvider>);
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 29, 9)); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("/search/worth-keeping", () => {
  it("lists every durable item over all pages: open return windows first, then by month", async () => {
    mocks.listReceipts
      .mockResolvedValueOnce({
        items: [
          r(1, { purchaseDate: "2026-10-27", isOnlinePurchase: false, total: 129, category: "Home", notableItems: n("Desk chair", 129) }),
          r(2, { purchaseDate: "2026-10-20", isOnlinePurchase: true, total: 649, notableItems: n("Smart TV", 599) }),
          r(3, { purchaseType: "subscription", purchaseDate: "2026-10-01", total: 99, notableItems: n("Annual plan", 99) }),
        ],
        nextCursor: "c2",
      })
      .mockResolvedValueOnce({
        items: [
          r(4, { purchaseDate: "2026-02-14", isOnlinePurchase: true, total: 305, notableItems: n("Laptop", 305) }),
          r(5, { purchaseDate: "2026-10-25", category: "Groceries", total: 80, notableItems: n("Olive oil", 60) }),
        ],
        nextCursor: null,
      });
    mount();
    const open = await screen.findByTestId("keep-group-return-open");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Worth keeping (3)");
    expect(mocks.listReceipts).toHaveBeenCalledTimes(2);
    expect(open).toHaveTextContent("Return window open");
    expect(within(open).getByText("Smart TV")).toBeInTheDocument();
    expect(within(open).getByText("Return by 3 Nov")).toBeInTheDocument();
    expect(screen.getByTestId("keep-group-2026-10")).toHaveTextContent("Desk chair");
    expect(screen.getByTestId("keep-group-2026-02")).toHaveTextContent("Laptop");
    expect(screen.queryByText("Annual plan")).toBeNull();
    expect(screen.queryByText("Olive oil")).toBeNull();
    expect(screen.getByLabelText("Back")).toHaveAttribute("href", "/search");
    fireEvent.click(screen.getByText("Laptop"));
    expect(mocks.sheet).toHaveBeenLastCalledWith(4);
  });

  it("shows an empty state when there are no durable goods", async () => {
    mocks.listReceipts.mockResolvedValueOnce({ items: [r(9, { category: "Groceries", total: 30 })], nextCursor: null });
    mount();
    expect(await screen.findByTestId("keep-empty")).toHaveTextContent("Nothing here yet.");
  });
});

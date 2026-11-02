import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), receipt: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/pwa", () => ({ usePwaUpdateBlocker: () => {} }));
vi.mock("@/components/ReceiptPreview", () => ({ ReceiptPreview: () => null }));
vi.mock("@workspace/api-client-react", () => ({
  useGetReceipt: () => ({ data: mocks.receipt, isLoading: false, isError: false }),
  useUpdateReceipt: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteReceipt: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getGetReceiptQueryKey: (id: number) => ["receipt", id],
  getListReceiptsQueryKey: () => ["receipts"],
  getGetReceiptStatsQueryKey: () => ["stats"],
  getGetRecentReceiptsQueryKey: () => ["recent"],
  customFetch: () => new Promise(() => {}),
}));
import { ReceiptSheet } from "./ReceiptSheet";
import { MarketContext, type MarketState } from "./MarketProvider";

const base = {
  id: 5, userId: "u", status: "completed", isDraft: false, merchant: "Apple", purchaseDate: "2026-10-20",
  deliveryDate: null, total: 2.99, currency: "EUR", category: "Entertainment", summary: null, warranty: null,
  transactionNumber: null, products: [{ name: "iCloud+ 200 GB", quantity: 1, price: 2.99 }], notableItems: [],
  purchaseCountry: "PT", isOnlinePurchase: true, originalFileName: "apple.pdf", objectPath: "/objects/x",
  contentType: "application/pdf", attachments: [], createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:00:00Z",
};

function mount(receipt: Record<string, unknown>, region: "PT" | "US" = "PT") {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  mocks.receipt = receipt;
  mocks.update.mockReset().mockResolvedValue({});
  const client = new QueryClient();
  // Rules follow the account market (MarketProvider): US -> US rules, PT -> PT rules.
  const market: MarketState = {
    market: region, country: null, source: "account", confirmed: true, loading: false, saving: false, error: null,
    choose: async () => {}, retry: () => {},
  };
  render(<QueryClientProvider client={client}><MarketContext.Provider value={market}><ReceiptSheet receiptId={5} open onClose={() => {}} /></MarketContext.Provider></QueryClientProvider>);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("ReceiptSheet: 'This is a subscription'", () => {
  it("shows only a note (no return window or warranty) for a subscription", () => {
    mount({ ...base, purchaseType: "subscription", purchaseTypeSource: "ai" });
    expect(screen.getByTestId("list-rights-notes")).toHaveTextContent(/^Subscription: no return window/);
    expect(screen.queryByText(/Return by/)).toBeNull();
  });

  it("turning the switch on saves purchaseType 'subscription'; untouched it is not sent", async () => {
    mount({ ...base, purchaseType: null, purchaseTypeSource: null });
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const toggle = await screen.findByTestId("switch-subscription");
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("purchaseType");

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.click(await screen.findByTestId("switch-subscription"));
    expect(screen.getByTestId("switch-subscription")).toHaveAttribute("data-state", "checked");
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update.mock.calls[1][0]).toMatchObject({ id: 5, data: { purchaseType: "subscription" } });
  });

  it("a detected ticket shows as on with its hint; turning it off saves 'goods'", async () => {
    mount({ ...base, purchaseType: "ticket", purchaseTypeSource: "hint" });
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const toggle = await screen.findByTestId("switch-subscription");
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(screen.getByText(/Detected as an event ticket/)).toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data.purchaseType).toBe("goods");
  });
});

describe("ReceiptSheet: US accounts", () => {
  const tv = {
    ...base, merchant: "Best Buy", currency: "USD", purchaseCountry: "US", category: "Electronics", isOnlinePurchase: false,
    purchaseDate: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10), total: 1299.99,
    products: [{ name: 'LG 65" OLED TV', quantity: 1, price: 1299.99 }], warranty: "2-year manufacturer warranty",
    purchaseType: "goods", returnDays: null,
  };
  it("shows 'Returns & warranty' with the store window for an in-store purchase, no legal warranty or review marker", () => {
    mount(tv, "US");
    expect(screen.getByText("Returns & warranty")).toBeInTheDocument();
    expect(screen.getByText(/Return by/)).toBeInTheDocument();
    expect(screen.getByText(/Best Buy: 15 days \(store policy, checked Oct 27, 2026\)/)).toBeInTheDocument();
    expect(screen.getByTestId("card-manufacturer-warranty")).toBeInTheDocument();
    expect(screen.queryByText(/legal warranty/i)).toBeNull();
    expect(screen.queryByText(/LEGAL REVIEW/)).toBeNull();
    expect(screen.queryByText(/Consumer Rights/)).toBeNull();
  });
  it("edits the store window: suggestion from the table, saved as returnDays", async () => {
    mount(tv, "US");
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(await screen.findByTestId("text-return-days-hint")).toHaveTextContent("Typical for Best Buy: 15 days");
    fireEvent.change(screen.getByTestId("input-return-days"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data.returnDays).toBe(60);
  });
  it("warranty quick pick: 3 yr saves the warranty text and previews the end date", async () => {
    mount({ ...tv, warranty: null, purchaseDate: "2026-11-27" }, "US");
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.click(await screen.findByTestId("button-warranty-3y"));
    expect(screen.getByTestId("text-warranty-end-preview")).toHaveTextContent("Ends Nov 27, 2029. We'll remind you before it ends.");
    expect(screen.getByTestId("text-warranty-end-preview").textContent).not.toMatch(/subscribed/);
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data.warranty).toBe("3-year manufacturer warranty");
  });
  it("PT accounts never see or send the store window field", async () => {
    mount(tv, "PT");
    expect(screen.queryByText("Returns & warranty")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    await screen.findByTestId("switch-subscription");
    expect(screen.queryByTestId("input-return-days")).toBeNull();
    expect(screen.queryByTestId("warranty-quick-pick")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("returnDays");
  });
});


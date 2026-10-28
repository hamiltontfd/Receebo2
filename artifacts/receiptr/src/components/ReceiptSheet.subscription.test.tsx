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

const base = {
  id: 5, userId: "u", status: "completed", isDraft: false, merchant: "Apple", purchaseDate: "2026-10-20",
  deliveryDate: null, total: 2.99, currency: "EUR", category: "Entertainment", summary: null, warranty: null,
  transactionNumber: null, products: [{ name: "iCloud+ 200 GB", quantity: 1, price: 2.99 }], notableItems: [],
  purchaseCountry: "PT", isOnlinePurchase: true, originalFileName: "apple.pdf", objectPath: "/objects/x",
  contentType: "application/pdf", attachments: [], createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:00:00Z",
};

function mount(receipt: Record<string, unknown>) {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  mocks.receipt = receipt;
  mocks.update.mockReset().mockResolvedValue({});
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><ReceiptSheet receiptId={5} open onClose={() => {}} /></QueryClientProvider>);
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

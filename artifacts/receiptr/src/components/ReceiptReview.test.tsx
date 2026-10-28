import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), update: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/receipts/5", mocks.navigate] }));
vi.mock("@/components/ReceiptPreview", () => ({
  ReceiptPreview: ({ fileName }: { fileName: string }) => <div>Original {fileName}</div>,
}));
vi.mock("@workspace/api-client-react", () => ({
  useGetReceipt: () => ({
    isLoading: false, isError: false,
    data: {
      id: 5, merchant: "Casa Lumen", purchaseDate: "2026-10-25", total: 349, currency: "EUR",
      category: "Electronics", warranty: "2-year manufacturer", objectPath: "/objects/uploads/x",
      originalFileName: "email.pdf", products: [{ name: "Soundbar", quantity: 1, price: 329 }],
    },
  }),
  useUpdateReceipt: () => ({ mutateAsync: mocks.update, isPending: false }),
  getGetReceiptQueryKey: (id: number) => ["receipt", id],
  getListReceiptsQueryKey: () => ["receipts"],
  getGetReceiptStatsQueryKey: () => ["stats"],
  getGetRecentReceiptsQueryKey: () => ["recent"],
}));
import { ReceiptReview } from "./ReceiptReview";

function mount(doneHref = "/imports") {
  render(<QueryClientProvider client={new QueryClient()}><ReceiptReview receiptId={5} doneHref={doneHref} /></QueryClientProvider>);
}
afterEach(() => { mocks.navigate.mockReset(); mocks.update.mockReset(); });

describe("ReceiptReview (after accepting an email import)", () => {
  it("shows the 'Added to your receipts' banner and the edit card", async () => {
    mount();
    expect(await screen.findByText("Added to your receipts")).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant")).toHaveValue("Casa Lumen");
    expect(screen.getByLabelText("Warranty")).toHaveValue("2-year manufacturer");
    expect(screen.getByText("Items · 1")).toBeInTheDocument();
    expect(screen.getByText("Original email.pdf")).toBeInTheDocument();
  });

  it("Done without changes just goes back; with changes it saves first", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("review-done"));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/imports");

    mocks.navigate.mockReset();
    fireEvent.change(screen.getByLabelText("Merchant"), { target: { value: "Casa Lumen Lda" } });
    fireEvent.click(screen.getByTestId("review-done"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/imports"));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 5, data: expect.objectContaining({ merchant: "Casa Lumen Lda", category: "Electronics" }),
    }));
  });
});

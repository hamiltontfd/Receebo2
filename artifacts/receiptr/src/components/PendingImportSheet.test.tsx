import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), navigate: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: () => new Promise(() => {}) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/search", mocks.navigate],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import { PendingImportSheet } from "./PendingImportSheet";
import { BILLING_QUERY_KEY } from "@/hooks/useBilling";

const detail = {
  id: 9, provider: "outlook", gmailMessageId: "m", originalFileName: "r.pdf", merchant: "Casa Lumen Electrónica",
  total: 349, currency: "EUR", purchaseDate: "2026-10-25", category: "Electronics", summary: null,
  createdAt: "2026-10-28T10:00:00Z", itemCount: 2, firstItemName: "Soundbar", productCount: 2, notableCount: 0,
  extraction: {
    merchant: "Casa Lumen Electrónica", purchaseDate: "2026-10-25", total: 349, currency: "EUR",
    category: "Electronics", summary: null, warranty: null, transactionNumber: null,
    products: [{ name: "Soundbar 3.1 Dolby Atmos", quantity: 1, price: 329 }, { name: "HDMI 2.1 cable, 2 m", quantity: 1, price: 20 }],
    notableItems: [], purchaseCountry: "PT", isOnlinePurchase: true, deliveryDate: null,
  },
  objectPath: "/objects/uploads/x", originalUrl: "/api/storage/objects/uploads/x",
};

function mount(billing: Record<string, unknown> = { plan: "pro", accessState: "paid", canUseApp: true }) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/approve")) return { ok: true, status: 200, json: async () => ({ approved: true, receiptId: 77 }) };
    return { ok: true, status: 200, json: async () => detail };
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(BILLING_QUERY_KEY, billing);
  const onClose = vi.fn();
  render(<QueryClientProvider client={client}><PendingImportSheet importId={9} open onClose={onClose} /></QueryClientProvider>);
  return { fetchMock, onClose };
}

afterEach(() => { vi.unstubAllGlobals(); mocks.toast.mockReset(); mocks.navigate.mockReset(); });

describe("PendingImportSheet", () => {
  it("shows the read-only details, the suggested category and the legal warranty", async () => {
    mount();
    expect(await screen.findByText("Casa Lumen Electrónica")).toBeInTheDocument();
    expect(screen.getByText("Found in Outlook")).toBeInTheDocument();
    expect(screen.getByTestId("pending-view-original")).toBeInTheDocument();
    expect(screen.getByTestId("pending-category")).toHaveTextContent("Electronics");
    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("Soundbar 3.1 Dolby Atmos")).toBeInTheDocument();
    expect(screen.getByText("Items · 2")).toBeInTheDocument();
    expect(screen.getByText(/tracked once you accept/)).toBeInTheDocument();
  });

  it("Accept saves with the chosen category and opens the short review", async () => {
    const { fetchMock, onClose } = mount();
    fireEvent.click(await screen.findByTestId("pending-sheet-accept"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/receipts/77?review=1"));
    expect(onClose).toHaveBeenCalled();
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/approve"));
    expect(JSON.parse(String(call![1].body))).toEqual({ category: "Electronics" });
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Receipt added to your library" });
  });

  it("disables Accept at the trial cap", async () => {
    mount({ plan: "free", accessState: "trial_exhausted", canUseApp: true, canUpload: false });
    expect(await screen.findByTestId("pending-sheet-accept")).toBeDisabled();
    expect(screen.getByTestId("pending-sheet-trial-cap")).toBeInTheDocument();
  });
});

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

let alwaysImportResponse: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: {} };

function mount(billing: Record<string, unknown> = { plan: "pro", accessState: "paid", canUseApp: true }, item: Record<string, unknown> = detail) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/always-import")) {
      const r = alwaysImportResponse;
      return { ok: r.ok, status: r.status, json: async () => r.body };
    }
    if (url.includes("/approve")) return { ok: true, status: 200, json: async () => ({ approved: true, receiptId: 77 }) };
    return { ok: true, status: 200, json: async () => item };
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

  it("marks a detected subscription (no dates) and sends the switch only when changed", async () => {
    const sub = { ...detail, merchant: "Apple", purchaseType: "subscription",
      extraction: { ...detail.extraction, merchant: "Apple", products: [{ name: "iCloud+ 200 GB", quantity: 1, price: 2.99 }] } };
    const { fetchMock } = mount(undefined, sub);
    expect(await screen.findByTestId("pending-purchase-type")).toHaveTextContent("Subscription");
    expect(screen.getByTestId("pending-switch-subscription")).toHaveAttribute("data-state", "checked");
    expect(screen.getByText(/^Subscription: no return window/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pending-switch-subscription"));
    expect(screen.getByTestId("pending-switch-subscription")).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(screen.getByTestId("pending-sheet-accept"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/approve"));
    expect(JSON.parse(String(call![1].body))).toEqual({ category: "Electronics", purchaseType: "goods" });
  });
});

describe("PendingImportSheet header", () => {
  it("has no close X and shows the total on the name line", async () => {
    mount();
    const title = await screen.findByText("Casa Lumen Electrónica", { selector: "h2" });
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(title.className).toContain("leading-5");
    expect(title.parentElement).toContainElement(screen.getByTestId("pending-sheet-total"));
    expect(screen.getByTestId("pending-sheet-total")).toHaveTextContent("€349.00");
  });

  it("Escape / outside closes without deciding", async () => {
    const { fetchMock, onClose } = mount();
    await screen.findByText("Casa Lumen Electrónica", { selector: "h2" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "DELETE")).toBe(false);
  });
});

describe("PendingImportSheet for an undecided recurring supplier", () => {
  const recurringDetail = (pendingCount: number, kind = "subscription", status = "undecided") => ({
    ...detail, merchant: "Netflix", category: "Entertainment",
    extraction: { ...detail.extraction, merchant: "Netflix", category: "Entertainment", total: 13.99, products: [] },
    purchaseType: "subscription",
    recurring: { supplierKey: "netflix", displayName: "Netflix", kind, category: "Entertainment", status, pendingCount },
  });

  it("shows the info card with the count, hides the subscription switch, footer Dismiss / Always import", async () => {
    mount(undefined, recurringDetail(3));
    const card = await screen.findByTestId("pending-recurring-card");
    expect(card).toHaveTextContent("Netflix looks like a subscription");
    expect(screen.getByTestId("pending-recurring-count")).toHaveTextContent("Also adds 2 more waiting here.");
    expect(card.querySelector("a, button")).toBeNull();
    expect(screen.queryByTestId("pending-switch-subscription")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-category")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByTestId("pending-sheet-always-import")).toHaveTextContent("Always import");
    expect(screen.queryByTestId("pending-sheet-accept")).not.toBeInTheDocument();
  });

  it("utility variant without others: no count line", async () => {
    mount(undefined, recurringDetail(1, "utility"));
    expect(await screen.findByTestId("pending-recurring-card")).toHaveTextContent("Netflix looks like a recurring bill");
    expect(screen.queryByTestId("pending-recurring-count")).not.toBeInTheDocument();
  });

  it("Always import: one call, closes without the review screen, toast with Manage and the cap split", async () => {
    alwaysImportResponse = {
      ok: true, status: 200,
      body: { supplier: { supplierKey: "netflix", displayName: "Netflix", status: "on" }, approved: [{ id: 9, receiptId: 1 }, { id: 3, receiptId: 2 }], skipped: [4], code: "TRIAL_UPLOAD_LIMIT" },
    };
    const { fetchMock, onClose } = mount(undefined, recurringDetail(3));
    fireEvent.click(await screen.findByTestId("pending-sheet-always-import"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/always-import"))!;
    expect(call[0]).toContain("/api/mail/recurring-suppliers/netflix/always-import");
    expect(JSON.parse(String(call[1].body))).toEqual({ id: 9 });
    expect(mocks.navigate).not.toHaveBeenCalled();
    const t = mocks.toast.mock.calls.at(-1)![0];
    expect(t.title).toBe("Netflix receipts will now import automatically");
    expect(t.description).toBe("2 added · 1 still waiting");
  });

  it("409 SYNC_IN_PROGRESS: the sheet stays open with the neutral toast", async () => {
    alwaysImportResponse = { ok: false, status: 409, body: { code: "SYNC_IN_PROGRESS" } };
    const { onClose } = mount(undefined, recurringDetail(2));
    fireEvent.click(await screen.findByTestId("pending-sheet-always-import"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.toast.mock.calls.at(-1)![0].variant).not.toBe("destructive");
    expect(screen.getByTestId("pending-recurring-card")).toBeInTheDocument();
  });

  it("an off supplier gets the normal sheet (Accept, switch, no card)", async () => {
    mount(undefined, recurringDetail(1, "subscription", "off"));
    expect(await screen.findByTestId("pending-sheet-accept")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-recurring-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-switch-subscription")).toBeInTheDocument();
  });
});

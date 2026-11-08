import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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

function mount(receipt: Record<string, unknown>, region: "PT" | "US" = "PT", onClose: () => void = () => {}) {
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
  render(<QueryClientProvider client={client}><MarketContext.Provider value={market}><ReceiptSheet receiptId={5} open onClose={onClose} /></MarketContext.Provider></QueryClientProvider>);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("ReceiptSheet summary", () => {
  it("does not show the summary card, and still shows the highlight", () => {
    mount({
      ...base,
      merchant: "Casa Lumen Electrónica",
      summary: "In-store purchase at Casa Lumen Electrónica of a 55\" 4K Smart TV. Fictional sample purchase in Portugal.",
      notableItems: [{ name: "55\" 4K Smart TV", price: 649, category: "Electronics", reason: "High-value electronics with legal and manufacturer warranty." }],
    });
    expect(screen.queryByText("Summary")).toBeNull();
    expect(screen.queryByText("Resumo")).toBeNull();
    expect(screen.queryByText(/In-store purchase at Casa Lumen/)).toBeNull();
    expect(screen.getByText("55\" 4K Smart TV")).toBeInTheDocument();
    expect(screen.queryByText(/High-value electronics/)).toBeNull();
    expect(screen.getByTestId("section-highlights")).toBeInTheDocument();
  });
});

describe("ReceiptSheet delivery date", () => {
  const goods = { ...base, merchant: "Loja", purchaseCountry: "BR", currency: "BRL", category: "Home", purchaseType: "goods", total: 339 };

  it("shows the optional delivery date when the purchase is online", () => {
    mount({ ...goods, isOnlinePurchase: true });
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.getByTestId("input-delivery-date")).toBeInTheDocument();
  });

  it("hides the delivery date for an in-store purchase and does not clear it on save", async () => {
    mount({ ...goods, isOnlinePurchase: false, deliveryDate: "2026-11-03" });
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.queryByTestId("input-delivery-date")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("deliveryDate");
  });
});

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
    expect(screen.queryByText("Returns & warranty")).toBeNull();
    expect(screen.getByTestId("section-return-by")).toBeInTheDocument();
    expect(screen.getByTestId("section-warranty")).toBeInTheDocument();
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

describe("ReceiptSheet warranty info Escape", () => {
  const sample = {
    ...base,
    merchant: "Demo Electronics",
    purchaseCountry: "US",
    currency: "USD",
    category: "Electronics",
    isOnlinePurchase: true,
    purchaseDate: "2026-11-01",
    warranty: "Fictional manufacturer warranty: 2 years from purchase date.",
    summary: "This summary must stay hidden.",
    products: [{ name: "TV sample television", quantity: 1, price: 299 }],
    notableItems: [{ name: "TV sample television", price: 299, category: "Electronics", reason: "High-value electronics." }],
  };

  function pressEscape() {
    const target = document.activeElement instanceof Element ? document.activeElement : document.body;
    fireEvent.keyDown(target, { key: "Escape" });
  }

  async function expectOverlayClosed(onClose: ReturnType<typeof vi.fn>) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Demo Electronics")).toBeInTheDocument();
    expect(screen.getByTestId("section-warranty")).toBeInTheDocument();
    expect(screen.queryByTestId("text-rights-info")).toBeNull();
    expect(screen.queryByText(/No federal minimum/)).toBeNull();
    expect(screen.queryByText("Summary")).toBeNull();
    expect(screen.queryByText(/This summary must stay hidden/)).toBeNull();
  }

  it("Escape closes only the legal text after click, hover, and focus", async () => {
    const onClose = vi.fn();
    mount(sample, "US", onClose);
    expect(screen.queryByTestId("text-rights-info")).toBeNull();
    expect(screen.getByTestId("section-warranty")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-rights-info"));
    expect(screen.getByTestId("text-rights-info").textContent).toMatch(/No federal minimum return right or warranty in the US/);
    expect(screen.getByTestId("text-rights-info").textContent).toMatch(/General information, not legal advice/);
    expect(screen.getByTestId("text-rights-info").textContent).not.toMatch(/return window/i);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByTestId("button-return-info"));
    expect(screen.getByTestId("text-return-info").textContent).toMatch(/don't know this store's return window/i);
    expect(screen.getByTestId("text-return-info").textContent).not.toMatch(/manufacturer's warranty/i);
    pressEscape();
    await expectOverlayClosed(onClose);

    screen.getByRole("button", { name: /Edit/ }).focus();
    fireEvent.pointerEnter(screen.getByTestId("button-rights-info"), { pointerType: "mouse" });
    expect(screen.getByTestId("text-rights-info")).toBeInTheDocument();
    pressEscape();
    await expectOverlayClosed(onClose);

    screen.getByRole("button", { name: /Edit/ }).focus();
    fireEvent.focus(screen.getByTestId("button-rights-info"));
    expect(screen.getByTestId("text-rights-info")).toBeInTheDocument();
    pressEscape();
    await expectOverlayClosed(onClose);

    fireEvent.click(screen.getByTestId("button-rights-info"));
    expect(screen.getByTestId("text-rights-info")).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      screen.getByText("Demo Electronics").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" }),
      );
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expectOverlayClosed(onClose);

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reads per-item coverage, keeps country in edit, and saves the same line ids", async () => {
    const onClose = vi.fn();
    mount({
      ...sample,
      contentType: "image/jpeg",
      products: [
        { lineId: "l_tv000000000001", name: "TV", quantity: 1, price: 299, category: "Electronics", categorySource: "user" },
        { lineId: "l_milk0000000001", name: "Milk", quantity: 1, price: 3, category: "Groceries", categorySource: "user" },
      ],
      notableItems: [{ name: "TV", price: 299, category: "Electronics", reason: "High-value electronics" }],
      itemRights: [
        { lineId: "l_tv000000000001", index: 0, contracts: [
          { id: "ret-tv", kind: "return", basis: "rule", certainty: "estimated", status: "expired", endDate: "2026-10-15", lengthDays: 14, ruleId: "PT:DL-24/2014" },
          { id: "war-tv", kind: "warranty", warrantyType: "legal", basis: "rule", certainty: "confirmed", status: "open", endDate: "2029-11-02", lengthMonths: 36, ruleId: "PT:DL-84/2021" },
          { id: "war-maker", kind: "warranty", warrantyType: "manufacturer", basis: "stated", certainty: "estimated", status: "open", lengthMonths: 24, endDate: "2028-11-01", evidence: "TV: 24 month manufacturer warranty" },
        ] },
        { lineId: "l_milk0000000001", index: 1, contracts: [
          { id: "ret-milk", kind: "return", basis: "rule", certainty: "unknown", status: "unknown" },
          { id: "war-milk", kind: "warranty", basis: "rule", certainty: "unknown", status: "unknown" },
        ] },
      ],
    }, "PT", onClose);
    const order = ["section-highlights", "section-return-by", "section-warranty", "section-complete-list", "button-view-original"].map((id) => screen.getByTestId(id));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByTestId("section-highlights").textContent).toMatch(/Est\. return by/);
    expect(screen.getByTestId("section-highlights").textContent).not.toMatch(/High-value/);
    expect(screen.getAllByTestId("row-return")).toHaveLength(1);
    expect(screen.getByTestId("row-return").textContent).toMatch(/TV/);
    expect(screen.getByTestId("row-return").textContent).not.toMatch(/Milk/);
    const warrantyText = screen.getAllByTestId("row-warranty").map((row) => row.textContent).join("\n");
    expect(warrantyText).toMatch(/TV/);
    expect(warrantyText).not.toMatch(/Milk|24 month manufacturer/);
    expect(screen.getByTestId("section-complete-list").textContent).toMatch(/Milk/);
    expect(screen.queryByText("Returns & warranty")).toBeNull();
    expect(screen.queryByText("Files")).toBeNull();
    expect(screen.queryByText("Original receipt")).toBeNull();
    expect(screen.getByTestId("button-view-original")).toBeInTheDocument();
    expect(screen.queryByText("Purchase country")).toBeNull();
    expect(screen.queryByText(/Fictional manufacturer warranty/)).toBeNull();
    expect(screen.getByTestId("section-complete-list").textContent?.indexOf("TV")).toBeLessThan(
      screen.getByTestId("section-complete-list").textContent?.indexOf("Milk") ?? 0,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.getByText("Purchase country")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(mocks.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const saved = mocks.update.mock.calls[0][0].data.products;
    expect(saved.map((line: { lineId: string }) => line.lineId)).toEqual(["l_tv000000000001", "l_milk0000000001"]);
    expect(saved[0].coverages).toBeUndefined();
  });

  it("shows an unknown warranty card without copying the receipt warranty, and keeps another contract when one field changes", async () => {
    mount({
      ...sample,
      contentType: "application/pdf",
      warranty: "Fictional manufacturer warranty: 2 years from purchase date.",
      products: [{
        lineId: "l_tv000000000001", name: "TV sample television", quantity: 1, price: 299, category: "Electronics",
        coverages: [
          { id: "c_commercial", kind: "warranty", warrantyType: "commercial", basis: "user", certainty: "confirmed", lengthMonths: 60, source: "user" },
          { id: "c_maker", kind: "warranty", warrantyType: "manufacturer", basis: "stated", certainty: "estimated", lengthMonths: 24, evidence: "TV: 24 month manufacturer warranty", source: "extraction" },
        ],
      }],
      notableItems: [],
      itemRights: [{
        lineId: "l_tv000000000001", index: 0,
        contracts: [{ id: "us-legal", kind: "warranty", warrantyType: "legal", basis: "rule", certainty: "confirmed", status: "not_applicable", ruleId: "US:no_federal_legal_warranty" }],
      }],
    }, "US");
    const warranty = screen.getByTestId("row-warranty");
    expect(warranty.textContent).toMatch(/Warranty unknown/);
    expect(warranty.textContent).not.toMatch(/2 years|24 month|Fictional/);
    expect(screen.queryByText("Files")).toBeNull();
    expect(screen.queryByText("Original receipt")).toBeNull();
    expect(screen.getByTestId("button-view-original").className).toMatch(/121212/);

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const maker = screen.getByRole("textbox", { name: /Manufacturer warranty/ });
    fireEvent.change(maker, { target: { value: "36" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const coverages = mocks.update.mock.calls.at(-1)?.[0].data.products[0].coverages;
    expect(coverages.map((c: { warrantyType: string }) => c.warrantyType).sort()).toEqual(["commercial", "manufacturer"]);
    expect(coverages.find((c: { warrantyType: string }) => c.warrantyType === "commercial").lengthMonths).toBe(60);
    expect(coverages.find((c: { id?: string }) => c.id === "c_maker").lengthMonths).toBe(36);
  });
});


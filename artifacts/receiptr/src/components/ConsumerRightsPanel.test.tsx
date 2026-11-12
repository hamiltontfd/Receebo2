import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { setAccountLocale } from "@/lib/locale";
import { ConsumerRightsPanel, type RightsReceipt } from "./ConsumerRightsPanel";
import { MarketContext, type MarketState } from "./MarketProvider";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const vacuum = (over: Partial<RightsReceipt> = {}): RightsReceipt => ({
  merchant: "Amazon.com.br",
  purchaseDate: iso(-2),
  deliveryDate: iso(-1),
  category: "Home",
  currency: "BRL",
  purchaseCountry: "BR",
  isOnlinePurchase: true,
  warranty: null,
  purchaseType: "goods",
  products: [{ name: "Aspirador Kärcher WDL 1s" }],
  notableItems: [{ name: "Aspirador Kärcher WDL 1s" }],
  ...over,
});

afterEach(() => {
  setAccountLocale(undefined);
  vi.unstubAllGlobals();
});

describe("ConsumerRightsPanel — same receipt, capture and later detail", () => {
  it("Brazil online with delivery shows the 7-day CDC window and an unconfirmed manufacturer warranty", () => {
    setAccountLocale("pt-BR");
    const receipt = vacuum();
    const { unmount } = render(<ConsumerRightsPanel receipt={receipt} />);
    const first = screen.getByTestId("panel-consumer-rights").textContent;
    expect(screen.getByTestId("card-return-window").textContent).toMatch(/CDC Art\. 49/);
    expect(screen.queryByTestId("card-return-provisional")).toBeNull();
    expect(screen.getByTestId("text-legal-warranty").textContent).toMatch(/90 dias/);
    expect(screen.getByTestId("card-manufacturer-unconfirmed").textContent).toMatch(/não confirmada/);
    expect(screen.queryByTestId("card-manufacturer-warranty")).toBeNull();
    unmount();
    render(<ConsumerRightsPanel receipt={receipt} />);
    expect(screen.getByTestId("panel-consumer-rights").textContent).toBe(first);
  });

  it("a blank delivery date is a provisional estimate, not a confirmed deadline", () => {
    setAccountLocale("en");
    render(<ConsumerRightsPanel receipt={vacuum({ deliveryDate: null })} />);
    expect(screen.getByTestId("card-return-provisional").textContent).toMatch(/Not a confirmed legal deadline/);
    expect(screen.getByTestId("text-delivery-missing").textContent).toMatch(/Delivery not informed/);
    expect(screen.queryByTestId("card-return-window")).toBeNull();
  });

  it("Amazon with an unknown channel asks for a correction and shows only an estimated return deadline", () => {
    setAccountLocale("pt-BR");
    const choose = vi.fn();
    render(<ConsumerRightsPanel receipt={vacuum({ isOnlinePurchase: null, deliveryDate: null })} onChooseChannel={choose} />);
    expect(screen.getByTestId("text-amazon-suggest").textContent).toMatch(/Sugerimos que esta compra na Amazon foi online/);
    expect(screen.queryByText(/Não dá para saber pelo recibo/)).toBeNull();
    expect(screen.queryByText(/costuma aceitar devoluções/)).toBeNull();
    expect(screen.queryByTestId("card-return-window")).toBeNull();
    expect(screen.getByTestId("card-return-provisional").textContent).toMatch(/estim|confirmad/i);
    expect(screen.getByTestId("text-delivery-missing").textContent).toMatch(/entrega/i);
    screen.getByTestId("button-channel-online").click();
    expect(choose).toHaveBeenCalledWith(true);
  });

  it("an unknown store with an unknown channel asks instead of hiding the question", () => {
    setAccountLocale("en");
    render(<ConsumerRightsPanel receipt={vacuum({ merchant: "Loja do bairro", isOnlinePurchase: null })} />);
    expect(screen.getByTestId("text-channel-ask").textContent).toMatch(/online or in store/);
    expect(screen.queryByTestId("text-delivery-missing")).toBeNull();
    expect(screen.queryByTestId("card-return-window")).toBeNull();
  });

  it("keeps the store-policy note for an unknown channel that is not Amazon", () => {
    setAccountLocale("pt-BR");
    render(<ConsumerRightsPanel receipt={vacuum({
      merchant: "Zara", purchaseCountry: "PT", currency: "EUR", category: "Clothing & Apparel",
      isOnlinePurchase: null, deliveryDate: null,
    })} />);
    expect(screen.getByTestId("text-channel-ask")).toBeInTheDocument();
    expect(screen.queryByText(/Não dá para saber pelo recibo/)).toBeNull();
    fireEvent.click(screen.getByTestId("button-rights-info"));
    expect(screen.getByTestId("text-rights-info").textContent).toMatch(/Não dá para saber pelo recibo/);
    expect(screen.getByTestId("text-rights-info").textContent).toMatch(/30 dias/);
  });

  it("keeps the warranty date visible and the legal paragraphs in the info control", async () => {
    setAccountLocale("en");
    const market: MarketState = {
      market: "US", country: "US", source: "account", confirmed: true, loading: false, saving: false, error: null,
      choose: async () => {}, retry: () => {},
    };
    render(
      <MarketContext.Provider value={market}>
        <ConsumerRightsPanel receipt={vacuum({
          merchant: "Demo Electronics", purchaseCountry: "US", currency: "USD", category: "Electronics",
          isOnlinePurchase: true, warranty: "Fictional manufacturer warranty: 2 years from purchase date.",
          products: [{ name: "TV sample television" }], notableItems: [{ name: "TV sample television" }],
        })} />
      </MarketContext.Provider>,
    );
    expect(screen.getByTestId("card-manufacturer-warranty").textContent).toMatch(/Manufacturer warranty \(2 years\)/);
    expect(screen.getByTestId("card-manufacturer-warranty").textContent).toMatch(/Until /);
    expect(screen.queryByText(/No federal minimum/)).toBeNull();
    expect(screen.queryByText(/General information, not legal advice/)).toBeNull();
    expect(screen.queryByText(/We don't know this store's return window/)).toBeNull();

    fireEvent.focus(screen.getByTestId("button-rights-info"));
    const open = screen.getByTestId("text-rights-info");
    expect(open.textContent).toMatch(/No federal minimum return right or warranty in the US/);
    expect(open.textContent).toMatch(/We don't know this store's return window/);
    expect(open.textContent).toMatch(/General information, not legal advice. Check with the store/);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("text-rights-info")).toBeNull();

    fireEvent.click(screen.getByTestId("button-rights-info"));
    expect(screen.getByTestId("text-rights-info")).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      screen.getByTestId("card-manufacturer-warranty").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" }),
      );
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(screen.queryByTestId("text-rights-info")).toBeNull();

    const button = screen.getByTestId("button-rights-info");
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(screen.getByTestId("text-rights-info").textContent).toMatch(/General information, not legal advice. Check with the store/);
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(screen.queryByTestId("text-rights-info")).toBeNull();
  });

  it("does not mention a missing delivery date for an in-store purchase", () => {
    setAccountLocale("pt-BR");
    render(<ConsumerRightsPanel receipt={vacuum({ isOnlinePurchase: false, deliveryDate: null })} />);
    expect(screen.queryByTestId("text-delivery-missing")).toBeNull();
    expect(screen.queryByTestId("text-amazon-suggest")).toBeNull();
  });
});

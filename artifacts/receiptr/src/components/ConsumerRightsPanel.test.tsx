import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setAccountLocale } from "@/lib/locale";
import { ConsumerRightsPanel, type RightsReceipt } from "./ConsumerRightsPanel";

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

  it("Amazon with an unknown channel asks for a correction and does not show a return countdown", () => {
    setAccountLocale("pt-BR");
    const choose = vi.fn();
    render(<ConsumerRightsPanel receipt={vacuum({ isOnlinePurchase: null, deliveryDate: null })} onChooseChannel={choose} />);
    expect(screen.getByTestId("text-amazon-suggest").textContent).toMatch(/Sugerimos que esta compra na Amazon foi online/);
    expect(screen.queryByTestId("card-return-window")).toBeNull();
    expect(screen.queryByTestId("card-return-provisional")).toBeNull();
    screen.getByTestId("button-channel-online").click();
    expect(choose).toHaveBeenCalledWith(true);
  });

  it("an unknown store with an unknown channel asks instead of hiding the question", () => {
    setAccountLocale("en");
    render(<ConsumerRightsPanel receipt={vacuum({ merchant: "Loja do bairro", isOnlinePurchase: null })} />);
    expect(screen.getByTestId("text-channel-ask").textContent).toMatch(/online or in store/);
    expect(screen.queryByTestId("card-return-window")).toBeNull();
  });
});

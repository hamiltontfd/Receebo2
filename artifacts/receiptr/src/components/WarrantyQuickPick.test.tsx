import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WarrantyQuickPick, warrantyEndPreview, warrantyTextForYears } from "./WarrantyQuickPick";
import { parseManufacturerWarrantyMonths } from "@/lib/consumerRights";

function Harness({ initial = "", onOther = () => {} }: { initial?: string; onOther?: () => void }) {
  const [v, setV] = useState(initial);
  return <><WarrantyQuickPick value={v} onChange={setV} purchaseDate="2026-11-27" onOther={onOther} /><output data-testid="v">{v}</output></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("WarrantyQuickPick", () => {
  it("saves the same warranty text the field and reminders already understand", () => {
    for (const y of [1, 2, 3]) expect(parseManufacturerWarrantyMonths(warrantyTextForYears(y))).toBe(y * 12);
  });
  it("end date preview per locale, clamped (29 Feb + 1 yr = 28 Feb)", () => {
    expect(warrantyEndPreview("2-year manufacturer warranty", "2026-11-27")).toBe("Nov 27, 2028");
    expect(warrantyEndPreview("1-year manufacturer warranty", "2028-02-29")).toBe("Feb 28, 2029");
    expect(warrantyEndPreview("2-year manufacturer warranty", "2026-11-27", "pt-PT")).toBe("27 nov 2028");
    expect(warrantyEndPreview("30-day returns", "2026-11-27")).toBeNull();
    expect(warrantyEndPreview("2-year manufacturer warranty", "")).toBeNull();
  });
  it("buttons set the text and show 'Ends …' (no 'while you're subscribed'); Other focuses the field", () => {
    const onOther = vi.fn();
    render(<Harness onOther={onOther} />);
    expect(screen.queryByTestId("text-warranty-end-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("button-warranty-2y"));
    expect(screen.getByTestId("v")).toHaveTextContent("2-year manufacturer warranty");
    expect(screen.getByTestId("button-warranty-2y")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("text-warranty-end-preview")).toHaveTextContent(/^Ends Nov 27, 2028\. We'll remind you before it ends\.$/);
    fireEvent.click(screen.getByTestId("button-warranty-other"));
    expect(onOther).toHaveBeenCalledTimes(1);
  });
  it("free text with another length marks Other and still previews", () => {
    render(<Harness initial="18 months manufacturer warranty" />);
    expect(screen.getByTestId("button-warranty-other")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("text-warranty-end-preview")).toHaveTextContent("Ends May 27, 2028.");
  });
  it("pt-PT and pt-BR copy", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    render(<Harness initial="2-year manufacturer warranty" />);
    expect(screen.getByTestId("button-warranty-1y")).toHaveTextContent("1 ano");
    expect(screen.getByTestId("button-warranty-3y")).toHaveTextContent("3 anos");
    expect(screen.getByTestId("text-warranty-end-preview")).toHaveTextContent("Termina em 27 de nov. de 2028. Avisaremos antes do fim.");
    cleanup();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-PT"]);
    render(<Harness initial="2-year manufacturer warranty" />);
    expect(screen.getByTestId("text-warranty-end-preview")).toHaveTextContent("Termina a 27 nov 2028. Avisamos antes do fim.");
    expect(screen.getByTestId("button-warranty-other")).toHaveTextContent("Outra duração");
  });
});

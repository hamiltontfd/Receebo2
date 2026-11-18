import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { setAccountLocale } from "@/lib/locale";
import { ItemCoverageSections, highlightMatches, type ShownLine, type ShownRights } from "./ItemCoverageSections";

afterEach(() => setAccountLocale(undefined));

const products: ShownLine[] = [
  { lineId: "l_display", name: "55-inch display", price: 360, category: "Electronics" },
  { lineId: "l_speaker", name: "Shelf speaker", price: 90, category: "Electronics" },
  { lineId: "l_cable", name: "Signal cable", price: 18 },
  { lineId: "l_anchors", name: "Wall anchors", price: 8 },
  { lineId: "l_cloth", name: "Cleaning cloth", price: 10 },
];

const evidence = "Illustrative sample: 55-inch display, 24-month manufacturer warranty. Not a store policy.";
const returnEvidence = "Illustrative sample: 55-inch display, 30-day return. Not a US legal minimum.";

const rights: ShownRights[] = [
  { lineId: "l_display", index: 0, contracts: [
    { id: "ret-display", kind: "return", basis: "stated", certainty: "estimated", status: "open", endDate: "2026-12-02", lengthDays: 30, evidence: returnEvidence },
    { id: "war-display", kind: "warranty", warrantyType: "manufacturer", basis: "stated", certainty: "estimated", status: "open", endDate: "2028-11-02", lengthMonths: 24, evidence },
    { id: "legal-display", kind: "warranty", warrantyType: "legal", basis: "rule", certainty: "confirmed", status: "not_applicable", ruleId: "US:no_federal_legal_warranty" },
  ] },
  { lineId: "l_speaker", index: 1, contracts: [
    { id: "ret-speaker", kind: "return", basis: "rule", certainty: "unknown", status: "unknown" },
    { id: "war-speaker", kind: "warranty", basis: "rule", certainty: "unknown", status: "unknown" },
  ] },
  { lineId: "l_cable", index: 2, contracts: [
    { id: "ret-cable", kind: "return", basis: "rule", certainty: "unknown", status: "unknown" },
    { id: "war-cable", kind: "warranty", basis: "rule", certainty: "unknown", status: "unknown" },
  ] },
  { lineId: "l_anchors", index: 3, contracts: [
    { id: "ret-anchors", kind: "return", basis: "rule", certainty: "unknown", status: "unknown" },
    { id: "war-anchors", kind: "warranty", basis: "rule", certainty: "unknown", status: "unknown" },
  ] },
  { lineId: "l_cloth", index: 4, contracts: [
    { id: "ret-cloth", kind: "return", basis: "rule", certainty: "unknown", status: "unknown" },
    { id: "war-cloth", kind: "warranty", basis: "rule", certainty: "unknown", status: "unknown" },
  ] },
];

describe("highlight reading cards", () => {
  it("uses the same unique name match as the highlight cards", () => {
    const matches = highlightMatches(products, [
      { name: "Shelf speaker" },
      { name: "55-inch display" },
      { name: "Signal cable" },
      { name: "Missing item" },
    ]);
    expect(matches.map((match) => match.line?.lineId ?? null)).toEqual(["l_speaker", "l_display", "l_cable", null]);
    const doubled = highlightMatches(
      [...products, { lineId: "l_display_2", name: "55-inch display" }],
      [{ name: "55-inch display" }],
    );
    expect(doubled[0].line).toBeNull();
  });

  it("shows the two highlights in return and warranty, and all five products in the list", () => {
    render(
      <ItemCoverageSections
        products={products}
        notableItems={[
          { name: "55-inch display", price: 360, category: "Electronics" },
          { name: "Shelf speaker", price: 90, category: "Electronics" },
        ]}
        itemRights={rights}
        currency="USD"
      />,
    );
    const returns = screen.getAllByTestId("row-return").map((row) => row.textContent ?? "");
    const warranties = screen.getAllByTestId("row-warranty").map((row) => row.textContent ?? "");
    expect(returns).toHaveLength(2);
    expect(warranties).toHaveLength(2);
    expect(returns.join("\n")).toMatch(/55-inch display/);
    expect(returns.join("\n")).toMatch(/Shelf speaker/);
    expect(returns.join("\n")).toMatch(/Return window unknown/);
    expect(warranties.join("\n")).toMatch(/Manufacturer · Estimated · 2 years/);
    expect(warranties.join("\n")).toMatch(/Warranty unknown/);
    expect(screen.getByTestId("section-highlights").textContent).toMatch(/Manufacturer · Estimated · 2 years/);
    expect(screen.getByTestId("section-warranty").textContent).not.toMatch(/\bLegal\b/);
    expect(returns.join("\n") + warranties.join("\n")).not.toMatch(/Signal cable|Wall anchors|Cleaning cloth|Illustrative sample/);
    for (const name of ["55-inch display", "Shelf speaker", "Signal cable", "Wall anchors", "Cleaning cloth"]) {
      expect(screen.getByTestId("section-complete-list").textContent).toContain(name);
    }

    fireEvent.click(screen.getByTestId("button-rights-info"));
    expect(screen.getByTestId("text-rights-info").textContent).toMatch(/Illustrative sample: 55-inch display, 24-month/);
    fireEvent.click(screen.getByTestId("button-return-info"));
    expect(screen.getByTestId("text-return-info").textContent).toMatch(/30-day return/);
    expect(screen.getByTestId("text-return-info").textContent).not.toMatch(/24-month manufacturer/);
  });

  it("labels both EU terms on one card and keeps a commercial term distinct", () => {
    setAccountLocale("pt-PT");
    render(
      <ItemCoverageSections
        products={[{ lineId: "l_tv", name: "55\" 4K Smart TV", price: 480, category: "Electronics" }]}
        notableItems={[{ name: "55\" 4K Smart TV", price: 480, category: "Electronics" }]}
        itemRights={[{
          lineId: "l_tv", index: 0, contracts: [
            { id: "maker", kind: "warranty", warrantyType: "manufacturer", basis: "stated", certainty: "estimated", status: "open", endDate: "2028-10-23", lengthMonths: 24, evidence: "Illustrative sample: 55\" 4K Smart TV, 2-year manufacturer warranty." },
            { id: "legal", kind: "warranty", warrantyType: "legal", basis: "rule", certainty: "estimated", status: "open", endDate: "2029-10-23", lengthMonths: 36, ruleId: "PT:DL-84/2021" },
            { id: "shop", kind: "warranty", warrantyType: "commercial", basis: "user", certainty: "confirmed", status: "open", endDate: "2031-10-23", lengthMonths: 60 },
          ],
        }]}
        currency="EUR"
      />,
    );
    const card = screen.getByTestId("row-warranty");
    const terms = screen.getAllByTestId("warranty-term").map((row) => row.textContent);
    expect(screen.getAllByTestId("row-warranty")).toHaveLength(1);
    expect(card.textContent?.match(/55" 4K Smart TV/g)).toHaveLength(1);
    expect(terms).toEqual([
      "Fabricante · Estimado · 2 anos · 23 out 2028",
      "Legal · Estimado · 3 anos · 23 out 2029",
      "Garantia comercial · 5 anos · 23 out 2031",
    ]);
    expect(card.textContent).not.toMatch(/Illustrative sample/);
    expect(screen.getByTestId("section-highlights").textContent).toMatch(/Fabricante · Estimado · 2 anos/);
    expect(screen.getByTestId("section-highlights").textContent).toMatch(/Legal · Estimado · 3 anos/);
  });

  it("uses the singular for one year and one month in each language", () => {
    const line = { lineId: "l_bar", name: "Sample soundbar", price: 149 };
    const renderMonths = (months: number) => render(
      <ItemCoverageSections
        products={[line]}
        notableItems={[{ name: line.name, price: line.price }]}
        itemRights={[{
          lineId: line.lineId, index: 0, contracts: [
            { id: "term", kind: "warranty", warrantyType: "manufacturer", basis: "stated", certainty: "estimated", status: "open", endDate: "2027-10-23", lengthMonths: months },
          ],
        }]}
        currency="EUR"
      />,
    );
    for (const [locale, oneYear, oneMonth, many] of [
      ["en", "1 year", "1 month", "18 months"],
      ["pt-PT", "1 ano", "1 mês", "18 meses"],
      ["pt-BR", "1 ano", "1 mês", "18 meses"],
    ] as const) {
      setAccountLocale(locale);
      const year = renderMonths(12);
      expect(screen.getByTestId("warranty-term").textContent).toContain(oneYear);
      expect(screen.getByTestId("warranty-term").textContent).not.toMatch(/1 years|1 anos/);
      year.unmount();
      const month = renderMonths(1);
      expect(screen.getByTestId("warranty-term").textContent).toContain(oneMonth);
      month.unmount();
      const rest = renderMonths(18);
      expect(screen.getByTestId("warranty-term").textContent).toContain(many);
      rest.unmount();
    }
  });

  it("keeps every line when there are no highlights", () => {
    render(<ItemCoverageSections products={products} notableItems={[]} itemRights={rights} currency="USD" />);
    expect(screen.queryByTestId("section-highlights")).toBeNull();
    expect(screen.getAllByTestId("row-return")).toHaveLength(5);
    expect(screen.getAllByTestId("row-warranty")).toHaveLength(5);
  });

  it("labels fallback contracts as receipt-sourced even when they carry extracted evidence", () => {
    render(
      <ItemCoverageSections
        products={[{ lineId: "l_device", name: "Device" }]}
        itemRights={[{
          lineId: "l_device", index: 0, contracts: [
            { id: "receipt:l_device:return", kind: "return", basis: "stated", certainty: "estimated", status: "open", endDate: "2026-12-02", lengthDays: 30, evidence: "2-year manufacturer warranty; 30-day returns" },
          ],
        }]}
      />,
    );
    fireEvent.click(screen.getByTestId("button-return-info"));
    expect(screen.getByTestId("text-return-info").textContent).toContain("Device: From the receipt");
    expect(screen.getByTestId("text-return-info").textContent).not.toContain("You saved this");
  });
});

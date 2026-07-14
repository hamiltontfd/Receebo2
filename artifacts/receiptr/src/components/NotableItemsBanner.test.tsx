import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotableItemsBanner } from "./NotableItemsBanner";
import type { NotableItem } from "@workspace/api-client-react";

const items: NotableItem[] = [
  { name: "Laptop", price: 999.99, category: "Electronics", reason: "Warranty claim" },
  { name: "Headphones", price: 49.5, category: null, reason: "Return policy" },
];

describe("NotableItemsBanner", () => {
  it("renders nothing when items array is empty", () => {
    const { container } = render(<NotableItemsBanner items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when items is falsy", () => {
    const { container } = render(
      <NotableItemsBanner items={null as unknown as NotableItem[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows $ symbol for USD currency", () => {
    render(<NotableItemsBanner items={items} currency="USD" />);
    const prices = screen.getAllByText(/\$\d/);
    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0].textContent).toMatch(/^\$999\.99$/);
  });

  it("shows $ symbol when currency is undefined (default)", () => {
    render(<NotableItemsBanner items={items} />);
    const price = screen.getByText("$999.99");
    expect(price).toBeInTheDocument();
  });

  it("shows $ symbol when currency is null", () => {
    render(<NotableItemsBanner items={items} currency={null} />);
    const price = screen.getByText("$999.99");
    expect(price).toBeInTheDocument();
  });

  it("shows € symbol for EUR currency", () => {
    render(<NotableItemsBanner items={items} currency="EUR" />);
    const price = screen.getByText("€999.99");
    expect(price).toBeInTheDocument();
    const price2 = screen.getByText("€49.50");
    expect(price2).toBeInTheDocument();
  });

  it("shows £ symbol for GBP currency", () => {
    render(<NotableItemsBanner items={items} currency="GBP" />);
    const price = screen.getByText("£999.99");
    expect(price).toBeInTheDocument();
    const price2 = screen.getByText("£49.50");
    expect(price2).toBeInTheDocument();
  });

  it("shows ISO code prefix for unknown currencies", () => {
    render(<NotableItemsBanner items={items} currency="JPY" />);
    const price = screen.getByText("JPY 999.99");
    expect(price).toBeInTheDocument();
  });

  it("renders item names and reasons", () => {
    render(<NotableItemsBanner items={items} currency="USD" />);
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Warranty claim")).toBeInTheDocument();
    expect(screen.getByText("Headphones")).toBeInTheDocument();
    expect(screen.getByText("Return policy")).toBeInTheDocument();
  });

  it("does not render price when price is null", () => {
    const noPrice: NotableItem[] = [
      { name: "Gift Card", price: null, category: null, reason: "No expiry proof" },
    ];
    render(<NotableItemsBanner items={noPrice} currency="USD" />);
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.getByText("Gift Card")).toBeInTheDocument();
  });

  it('shows the "Keep this receipt for:" heading', () => {
    render(<NotableItemsBanner items={items} currency="USD" />);
    expect(screen.getByText(/keep this receipt for:/i)).toBeInTheDocument();
  });
});

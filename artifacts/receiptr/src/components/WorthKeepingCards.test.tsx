import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Receipt } from "@workspace/api-client-react";
import { WorthKeepingCards } from "./WorthKeepingCards";
import { summarizeProtected, worthKeeping } from "@/lib/protectedValue";

const base = { objectPath: "/o", contentType: "image/jpeg", status: "completed", createdAt: "2026-10-20T10:00:00Z", currency: "EUR", purchaseCountry: "PT", category: "Electronics" };
const r = (id: number, over: Record<string, unknown>) => ({ ...base, id, originalFileName: `r${id}.jpg`, merchant: `Store ${id}`, ...over }) as unknown as Receipt;

describe("Worth keeping on the Search home", () => {
  const now = new Date(2026, 9, 29, 9);
  const receipts = [
    r(1, { purchaseDate: "2026-10-20", isOnlinePurchase: true, total: 649, notableItems: [{ name: "Smart TV", price: 599, reason: "" }] }),
    r(2, { purchaseDate: "2026-10-25", isOnlinePurchase: true, total: 229, category: "Home", notableItems: [{ name: "Cordless vacuum", price: 229, reason: "" }] }),
    r(3, { purchaseDate: "2026-10-26", isOnlinePurchase: true, total: 89.9, notableItems: [{ name: "Trainers", price: 89.9, reason: "" }] }),
  ];

  it("shows the 2 most valuable protected items with their date and opens the receipt", () => {
    const items = worthKeeping(receipts, summarizeProtected(receipts, now), now, 2);
    const onOpen = vi.fn();
    render(<WorthKeepingCards items={items} onOpen={onOpen} testId="search-worth-keeping" />);
    const section = screen.getByTestId("search-worth-keeping");
    expect(section).toHaveTextContent("Worth keeping");
    expect(screen.getAllByRole("button").map((b) => b.querySelector("p")?.textContent)).toEqual(["Smart TV", "Cordless vacuum"]);
    expect(section).toHaveTextContent("€599.00");
    expect(section).toHaveTextContent("Return by 3 Nov");
    fireEvent.click(screen.getByText("Smart TV"));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("renders nothing when there is nothing worth keeping", () => {
    const { container } = render(<WorthKeepingCards items={[]} onOpen={() => {}} testId="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

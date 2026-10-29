import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HighlightsRow } from "./HighlightsRow";

/** jsdom has no layout: give the row a 384px viewport over 9 cards of 160px + 12px gap. */
function layout(row: HTMLElement, cards: number) {
  const scrollWidth = cards * 160 + (cards - 1) * 12 + 40;
  Object.defineProperty(row, "clientWidth", { configurable: true, value: 384 });
  Object.defineProperty(row, "scrollWidth", { configurable: true, value: scrollWidth });
  for (const card of Array.from(row.children)) Object.defineProperty(card, "offsetWidth", { configurable: true, value: 160 });
  row.scrollTo = ((opts: ScrollToOptions) => {
    row.scrollLeft = opts.left ?? 0;
    row.dispatchEvent(new Event("scroll"));
  }) as typeof row.scrollTo;
  return scrollWidth - 384;
}

const cards = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} data-testid={`card-${i}`}>Card {i}</div>);

describe("HighlightsRow", () => {
  it("is a horizontally scrollable, focusable region", () => {
    render(<HighlightsRow>{cards(3)}</HighlightsRow>);
    const row = screen.getByTestId("highlights-row");
    expect(row).toHaveAttribute("role", "region");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("snap-mandatory");
  });

  it("the arrows reach every card, then hide at the end; back again to the start", () => {
    render(<HighlightsRow>{cards(9)}</HighlightsRow>);
    const row = screen.getByTestId("highlights-row");
    const max = layout(row, 9);
    act(() => { fireEvent.scroll(row); });
    expect(screen.queryByTestId("highlights-prev")).toBeNull();
    let clicks = 0;
    while (screen.queryByTestId("highlights-next") && clicks < 20) {
      fireEvent.click(screen.getByTestId("highlights-next"));
      clicks++;
    }
    expect(row.scrollLeft).toBe(max);
    expect(clicks).toBeGreaterThan(1);
    expect(screen.queryByTestId("highlights-next")).toBeNull();
    while (screen.queryByTestId("highlights-prev") && clicks < 40) {
      fireEvent.click(screen.getByTestId("highlights-prev"));
      clicks++;
    }
    expect(row.scrollLeft).toBe(0);
  });

  it("no arrows when everything fits", () => {
    render(<HighlightsRow>{cards(2)}</HighlightsRow>);
    const row = screen.getByTestId("highlights-row");
    Object.defineProperty(row, "clientWidth", { configurable: true, value: 384 });
    Object.defineProperty(row, "scrollWidth", { configurable: true, value: 384 });
    act(() => { fireEvent.scroll(row); });
    expect(screen.queryByTestId("highlights-next")).toBeNull();
    expect(screen.queryByTestId("highlights-prev")).toBeNull();
  });
});

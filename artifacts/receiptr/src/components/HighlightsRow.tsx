import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontally scrollable row of highlight cards (receipt details).
 * Touch and trackpad scroll natively (also Shift + mouse wheel); with a mouse,
 * the arrow buttons (pointer devices only) and the thin scrollbar reach every
 * card, and the row can be focused and scrolled with the arrow keys. A soft
 * fade marks the side that has more cards.
 */
export function HighlightsRow({ children, label = "Highlights" }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const cardStep = card ? card.offsetWidth + 12 : 172; // card + gap-3
    const step = Math.max(cardStep, Math.floor((el.clientWidth - 40) / cardStep) * cardStep);
    const max = el.scrollWidth - el.clientWidth;
    const left = Math.min(max, Math.max(0, el.scrollLeft + dir * step));
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "smooth" });
    else el.scrollLeft = left;
  };

  const arrow = "absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(hover:hover)]:flex w-8 h-8 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-secondary transition-colors";

  return (
    <div className="relative -mx-5">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-testid="highlights-row"
        className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 px-5 scroll-px-5 snap-x snap-proximity focus-visible:outline-none [scrollbar-width:none] [@media(hover:hover)]:[scrollbar-width:thin]"
      >
        {children}
      </div>
      {edges.left && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
      )}
      {edges.right && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
      )}
      {edges.left && (
        <button type="button" aria-label="Previous highlights" data-testid="highlights-prev" className={`${arrow} left-2`} onClick={() => page(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="More highlights" data-testid="highlights-next" className={`${arrow} right-2`} onClick={() => page(1)}>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

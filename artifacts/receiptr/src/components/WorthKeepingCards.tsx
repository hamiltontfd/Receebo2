import { Link } from "wouter";
import { ArrowRight, ChevronRight } from "lucide-react";
import { HighlightsRow } from "@/components/HighlightsRow";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import { formatAmount, type WorthKeepingItem } from "@/lib/protectedValue";

const TITLE = "text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

function Card({ item, onOpen, inRow }: { item: WorthKeepingItem; onOpen: (receiptId: number) => void; inRow: boolean }) {
  const CardIcon = categoryIcon(item.category);
  return (
    <button
      type="button"
      onClick={() => onOpen(item.receiptId)}
      className={`${inRow ? "shrink-0 w-40 snap-start bg-background" : "min-w-0 w-full h-full"} rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-secondary/50 transition-colors text-left`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
        <CardIcon className="w-[1.1rem] h-[1.1rem]" />
      </span>
      <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
      {item.price != null && (
        <p className="font-mono font-bold text-base">{formatAmount(item.price, item.currency)}</p>
      )}
      {item.caption && (
        <p className="mt-auto text-xs text-muted-foreground truncate">{item.caption}</p>
      )}
    </button>
  );
}

/**
 * "Worth keeping" cards. Stats: 2-column grid. Search home: one horizontal
 * row (same scroller as the receipt highlights) with a "See all" link and,
 * when there are more items than cards, a last "See all" card.
 */
export function WorthKeepingCards({
  items, onOpen, testId, layout = "grid", seeAllHref, hasMore = false,
}: {
  items: WorthKeepingItem[];
  onOpen: (receiptId: number) => void;
  testId: string;
  layout?: "grid" | "row";
  seeAllHref?: string;
  /** More qualifying items than the cards shown. */
  hasMore?: boolean;
}) {
  if (items.length === 0) return null;
  if (layout === "grid") {
    return (
      <section data-testid={testId}>
        <h2 className={`${TITLE} mb-3`}>Worth keeping</h2>
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, i) => <Card key={`${item.receiptId}-${i}`} item={item} onOpen={onOpen} inRow={false} />)}
        </div>
      </section>
    );
  }
  return (
    <section data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={TITLE}>Worth keeping</h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-0.5" data-testid={`${testId}-see-all`}>
            See all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <HighlightsRow label="Worth keeping" idPrefix={testId} prevLabel="Previous items" nextLabel="More items">
        {items.map((item, i) => <Card key={`${item.receiptId}-${i}`} item={item} onOpen={onOpen} inRow />)}
        {seeAllHref && hasMore && (
          <Link
            href={seeAllHref}
            className="shrink-0 w-28 snap-start rounded-2xl border border-dashed border-border p-4 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
            data-testid={`${testId}-more-card`}
          >
            <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <ArrowRight className="w-4 h-4" />
            </span>
            See all
          </Link>
        )}
      </HighlightsRow>
    </section>
  );
}

import { categoryIcon, categoryStyle } from "@/lib/categories";
import { formatAmount, type WorthKeepingItem } from "@/lib/protectedValue";

/** "Worth keeping" 2-column cards (Search home and Stats share the same look). */
export function WorthKeepingCards({
  items, onOpen, testId,
}: { items: WorthKeepingItem[]; onOpen: (receiptId: number) => void; testId: string }) {
  if (items.length === 0) return null;
  return (
    <section data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">Worth keeping</h2>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => {
          const CardIcon = categoryIcon(item.category);
          return (
            <button
              key={`${item.receiptId}-${i}`}
              onClick={() => onOpen(item.receiptId)}
              className="min-w-0 w-full h-full rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-secondary/50 transition-colors text-left"
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
        })}
      </div>
    </section>
  );
}

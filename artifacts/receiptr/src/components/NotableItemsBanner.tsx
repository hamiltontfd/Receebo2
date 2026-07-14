import type { NotableItem } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";

interface NotableItemsBannerProps {
  items: NotableItem[];
  currency?: string | null;
}

export function NotableItemsBanner({ items, currency }: NotableItemsBannerProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-xl border border-foreground/20 bg-foreground/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-3">
        Keep this receipt for:
      </p>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold leading-tight">{item.name}</span>
              {item.price != null && (
                <span className="text-sm font-mono font-medium shrink-0">
                  {currencySymbol(currency)}{item.price.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {item.category && (
                <span className="text-xs text-muted-foreground font-medium">
                  {item.category}
                </span>
              )}
              {item.category && (
                <span className="text-xs text-muted-foreground">·</span>
              )}
              <span className="text-xs text-muted-foreground">{item.reason}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

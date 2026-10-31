import { useMemo, useState } from "react";
import { appText } from "@/lib/appCopy";
import { useAppLocale, getAppLocale } from "@/lib/locale";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { ReceiptSheet } from "@/components/ReceiptSheet";
import { useAllReceipts } from "@/pages/stats";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import { deadlineUrgency, durableKeeping, formatAmount, formatShortDate, type DurableKeepItem } from "@/lib/protectedValue";

export interface KeepGroup { key: string; label: string; items: DurableKeepItem[] }

/** Open return windows first (one group), then one group per purchase month, newest first. */
export function groupKeepItems(items: DurableKeepItem[]): KeepGroup[] {
  const groups: KeepGroup[] = [];
  const open = items.filter((i) => i.status === "return");
  if (open.length > 0) groups.push({ key: "return-open", label: "Return window open", items: open });
  const byMonth = new Map<string, KeepGroup>();
  for (const item of items) {
    if (item.status === "return") continue;
    const key = item.day.slice(0, 7);
    let g = byMonth.get(key);
    if (!g) {
      g = { key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString(getAppLocale(), { month: "long", year: "numeric" }), items: [] };
      byMonth.set(key, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

const BADGE: Record<"red" | "amber" | "none", string> = {
  red: "bg-red-50 text-[#DC2626]",
  amber: "bg-amber-50 text-amber-800",
  none: "bg-secondary text-muted-foreground",
};

function KeepRow({ item, onOpen }: { item: DurableKeepItem; onOpen: () => void }) {
  const Icon = categoryIcon(item.category);
  const now = new Date();
  const meta = [item.merchant, formatShortDate(new Date(`${item.day}T00:00:00`), now, item.currency?.toUpperCase() === "USD")]
    .filter(Boolean).join(" · ");
  const protection = item.status === "none" ? null : item.caption;
  const urgency = item.status === "none" ? "none" : deadlineUrgency(item.daysLeft, item.status);
  return (
    <li data-testid={`keep-row-${item.receiptId}`}>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-2xl border bg-background px-4 py-3 flex items-center gap-3 text-left hover:bg-secondary/50 transition-colors"
      >
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
          <Icon className="w-[1.1rem] h-[1.1rem]" />
        </span>
        <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          <div className="min-w-0 md:flex-1">
            <p className="font-semibold truncate">{item.name}</p>
            {meta && <p className="text-xs text-muted-foreground truncate">{meta}</p>}
          </div>
          {protection && (
            <span className={`inline-block mt-1.5 md:mt-0 text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[urgency]}`}>
              {protection}
            </span>
          )}
        </div>
        {item.price != null && (
          <p className="font-bold font-mono shrink-0">{formatAmount(item.price, item.currency)}</p>
        )}
      </button>
    </li>
  );
}

/** "See all" from the Worth keeping row on the Search home. */
export default function WorthKeepingPage() {
  const locale = useAppLocale();
  const { data: receipts, isLoading, isError } = useAllReceipts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const items = useMemo(() => durableKeeping(receipts ?? []), [receipts, locale]);
  const groups = useMemo(() => groupKeepItems(items), [items, locale]);

  return (
    <>
      <ReceiptSheet receiptId={selectedId} open={selectedId !== null} onClose={() => setSelectedId(null)} />
      <PageTransition className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-4 pb-32">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/search"
            aria-label={appText("Back")}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center md:w-auto md:h-auto md:bg-transparent md:gap-1.5 md:text-sm md:text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden md:inline">{appText("Home")}</span>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {appText("Worth keeping")} {!isLoading && <span className="text-muted-foreground font-medium">({items.length})</span>}
          </h1>
          <p className="text-sm text-muted-foreground">{appText("Durable goods from your receipts. Open return windows first, then the most recent.")}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> {appText("Loading…")}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground py-10 text-center">{appText("Couldn't load your purchases. Check your connection and try again.")}</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border px-4 py-6 text-center text-sm" data-testid="keep-empty">
            <Package className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold">{appText("Nothing here yet.")}</p>
            <p className="text-muted-foreground">{appText("Electronics, furniture and other durable goods from your receipts will show up here.")}</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} data-testid={`keep-group-${group.key}`}>
              <div className="flex items-baseline justify-between mb-2 text-xs">
                <h2 className="font-semibold uppercase tracking-wide text-muted-foreground">{appText(group.label)}</h2>
                <span className="text-muted-foreground">{appText("{0} item(s)", [group.items.length])}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {group.items.map((item, i) => (
                  <KeepRow key={`${item.receiptId}-${i}`} item={item} onOpen={() => setSelectedId(item.receiptId)} />
                ))}
              </ul>
            </section>
          ))
        )}
      </PageTransition>
    </>
  );
}

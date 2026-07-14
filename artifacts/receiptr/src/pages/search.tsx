import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search as SearchIcon, Loader2, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListReceipts, useGetRecentReceipts } from "@workspace/api-client-react";
import type { Receipt } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";
import { CATEGORIES, categoryStyle } from "@/lib/categories";

function ReceiptRow({ r }: { r: Receipt }) {
  return (
    <li key={r.id}>
      <Link
        href={`/receipts/${r.id}`}
        className="flex items-center justify-between gap-4 py-4 group"
      >
        <div className="min-w-0 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            {r.status === "processing" ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <FileText className="w-4 h-4 text-muted-foreground" />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-semibold truncate group-hover:underline">
              {r.merchant || r.originalFileName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {format(new Date(r.purchaseDate || r.createdAt), "MMM d, yyyy")}
              </span>
              {r.category && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${categoryStyle(r.category)}`}>
                  {r.category}
                </span>
              )}
            </div>
          </div>
        </div>
        {r.total != null && (
          <span className="font-mono font-semibold shrink-0">
            {currencySymbol(r.currency)}{r.total.toFixed(2)}
          </span>
        )}
      </Link>
    </li>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const isSearching = debounced.length > 0;

  const { data: recent, isLoading: recentLoading } = useGetRecentReceipts({ limit: 10 });

  const { data: results, isLoading: searchLoading } = useListReceipts(
    isSearching ? { q: debounced } : undefined,
  );

  const notableItems = useMemo(() => {
    if (!recent) return [];
    const items: { name: string; price: number | null; category: string | null; receiptId: number; merchant: string | null; currency: string | null }[] = [];
    for (const r of recent) {
      for (const n of r.notableItems ?? []) {
        items.push({
          name: n.name,
          price: n.price ?? null,
          category: n.category ?? null,
          receiptId: r.id,
          merchant: r.merchant ?? null,
          currency: r.currency ?? null,
        });
        if (items.length === 3) break;
      }
      if (items.length === 3) break;
    }
    return items;
  }, [recent]);

  return (
    <div className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-5">
      <div className="relative">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search purchases..."
          className="pl-10 h-12 rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setQuery(query === cat ? "" : cat)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all ${categoryStyle(cat)} ${
              query === cat ? "border-current shadow-sm scale-105" : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {isSearching ? (
        searchLoading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : results && results.length > 0 ? (
          <ul className="divide-y">
            {results.map((r) => <ReceiptRow key={r.id} r={r} />)}
          </ul>
        ) : (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No purchases match your search.
          </div>
        )
      ) : (
        <>
          {recentLoading ? (
            <>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-3 overflow-hidden">
                  {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-40 rounded-2xl shrink-0" />)}
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            </>
          ) : (
            <>
              {notableItems.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Worth keeping</h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 snap-x snap-mandatory scrollbar-none">
                    {notableItems.map((item, i) => (
                      <Link
                        key={i}
                        href={`/receipts/${item.receiptId}`}
                        className="shrink-0 w-44 rounded-2xl border p-4 flex flex-col gap-2 snap-start hover:bg-secondary/50 transition-colors"
                      >
                        <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
                        {item.price != null && (
                          <p className="font-mono font-bold text-base">
                            {currencySymbol(item.currency)}{item.price.toFixed(2)}
                          </p>
                        )}
                        <div className="mt-auto flex flex-col gap-1">
                          {item.category && (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full w-fit ${categoryStyle(item.category)}`}>
                              {item.category}
                            </span>
                          )}
                          {item.merchant && (
                            <p className="text-xs text-muted-foreground truncate">{item.merchant}</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {recent && recent.length > 0 ? (
                <section>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recent</h2>
                  <ul className="divide-y">
                    {recent.map((r) => <ReceiptRow key={r.id} r={r} />)}
                  </ul>
                </section>
              ) : recent && recent.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  Scan your first receipt to get started.
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

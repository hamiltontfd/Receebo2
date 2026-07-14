import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search as SearchIcon, Loader2, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListReceipts, useGetRecentReceipts } from "@workspace/api-client-react";
import type { Receipt } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";
import { CATEGORIES, categoryStyle } from "@/lib/categories";
import {
  PageTransition,
  listVariants,
  itemVariants,
  cardVariants,
} from "@/components/PageTransition";

const ease = [0.25, 0.1, 0.25, 1] as const;

function ReceiptRow({ r, index }: { r: Receipt; index: number }) {
  return (
    <motion.li
      variants={itemVariants}
      layout
    >
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
    </motion.li>
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
    const items: {
      name: string;
      price: number | null;
      category: string | null;
      receiptId: number;
      merchant: string | null;
      currency: string | null;
    }[] = [];
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
    <PageTransition className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-5">
      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search purchases..."
          className="pl-10 h-12 rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
        />
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <motion.button
            key={cat}
            whileTap={{ scale: 0.92 }}
            onClick={() => setQuery(query === cat ? "" : cat)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all ${categoryStyle(cat)} ${
              query === cat
                ? "border-current shadow-sm scale-105"
                : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Content — animates between idle and search states */}
      <AnimatePresence mode="wait" initial={false}>
        {isSearching ? (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease }}
          >
            {searchLoading ? (
              <div className="space-y-3">
                {Array(4).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : results && results.length > 0 ? (
              <motion.ul
                className="divide-y"
                variants={listVariants}
                initial="hidden"
                animate="visible"
              >
                {results.map((r, i) => (
                  <ReceiptRow key={r.id} r={r} index={i} />
                ))}
              </motion.ul>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 text-muted-foreground text-sm"
              >
                No purchases match your search.
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease }}
            className="flex flex-col gap-5"
          >
            {recentLoading ? (
              <>
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-28 rounded-full" />
                  <div className="flex gap-3 overflow-hidden">
                    {Array(3).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-32 w-44 rounded-2xl shrink-0" />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-3.5 w-16 rounded-full" />
                  {Array(5).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              </>
            ) : (
              <>
                {notableItems.length > 0 && (
                  <section>
                    <motion.h2
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3"
                    >
                      Worth keeping
                    </motion.h2>
                    <motion.div
                      className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 snap-x snap-mandatory scrollbar-none"
                      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
                      initial="hidden"
                      animate="visible"
                    >
                      {notableItems.map((item, i) => (
                        <motion.div key={i} variants={cardVariants}>
                          <Link
                            href={`/receipts/${item.receiptId}`}
                            className="block shrink-0 w-44 rounded-2xl border p-4 flex flex-col gap-2 snap-start hover:bg-secondary/50 transition-colors"
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
                        </motion.div>
                      ))}
                    </motion.div>
                  </section>
                )}

                {recent && recent.length > 0 ? (
                  <section>
                    <motion.h2
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1"
                    >
                      Recent
                    </motion.h2>
                    <motion.ul
                      className="divide-y"
                      variants={listVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {recent.map((r, i) => (
                        <ReceiptRow key={r.id} r={r} index={i} />
                      ))}
                    </motion.ul>
                  </section>
                ) : recent && recent.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16 text-muted-foreground text-sm"
                  >
                    Scan your first receipt to get started.
                  </motion.div>
                ) : null}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

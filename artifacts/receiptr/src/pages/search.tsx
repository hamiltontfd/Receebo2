import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Search as SearchIcon, Loader2, ScanLine, Camera, Sparkles, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useListReceipts, useGetRecentReceipts } from "@workspace/api-client-react";
import type { Receipt } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";
import { CATEGORIES, categoryStyle, categoryIcon } from "@/lib/categories";
import {
  PageTransition,
  listVariants,
  itemVariants,
  cardVariants,
} from "@/components/PageTransition";

const ease = [0.25, 0.1, 0.25, 1] as const;

type DemoReceipt = {
  id: string;
  merchant: string;
  category: string;
  date: string;
  total: number;
  notableItem: string | null;
  itemPrice: number | null;
  summary: string;
  products: { name: string; price: number; qty: number }[];
};

const DEMO_RECEIPTS: DemoReceipt[] = [
  {
    id: "d1", merchant: "Apple Store", category: "Electronics", date: "Jul 12",
    total: 1299.00, notableItem: "MacBook Pro 14\"", itemPrice: 1199.00,
    summary: "MacBook Pro 14-inch M3 with AppleCare+ purchased at Apple Store.",
    products: [
      { name: "MacBook Pro 14\" M3", price: 1199.00, qty: 1 },
      { name: "AppleCare+ (3 Years)", price: 99.00, qty: 1 },
      { name: "USB-C to MagSafe Cable", price: 1.00, qty: 1 },
    ],
  },
  {
    id: "d2", merchant: "Whole Foods", category: "Groceries", date: "Jul 10",
    total: 68.42, notableItem: null, itemPrice: null,
    summary: "Weekly grocery run including organic produce and pantry essentials.",
    products: [
      { name: "Organic Almond Milk (6-pack)", price: 5.99, qty: 1 },
      { name: "Sourdough Bread", price: 7.49, qty: 2 },
      { name: "Avocados", price: 4.99, qty: 1 },
      { name: "Organic Eggs (12ct)", price: 8.99, qty: 1 },
      { name: "Greek Yogurt", price: 5.49, qty: 2 },
      { name: "Baby Spinach", price: 3.99, qty: 1 },
      { name: "Olive Oil", price: 12.99, qty: 1 },
    ],
  },
  {
    id: "d3", merchant: "Nike", category: "Clothing & Apparel", date: "Jul 7",
    total: 124.95, notableItem: "Air Max 270", itemPrice: 109.95,
    summary: "Nike Air Max 270 running shoes and performance socks.",
    products: [
      { name: "Nike Air Max 270 (Size 11)", price: 109.95, qty: 1 },
      { name: "Nike Performance Socks (3-pack)", price: 15.00, qty: 1 },
    ],
  },
  {
    id: "d4", merchant: "Delta Airlines", category: "Other", date: "Jun 30",
    total: 389.00, notableItem: null, itemPrice: null,
    summary: "Round-trip flight from JFK to LAX, Economy Plus.",
    products: [
      { name: "Economy Plus Fare (JFK→LAX)", price: 299.00, qty: 1 },
      { name: "Checked Bag Fee", price: 35.00, qty: 2 },
      { name: "Seat Selection", price: 20.00, qty: 1 },
    ],
  },
  {
    id: "d5", merchant: "IKEA", category: "Home", date: "Jun 28",
    total: 214.50, notableItem: null, itemPrice: null,
    summary: "Home office furniture and accessories.",
    products: [
      { name: "BEKANT Desk (White)", price: 149.00, qty: 1 },
      { name: "SKÅDIS Pegboard", price: 24.99, qty: 1 },
      { name: "KALLAX Shelf Unit", price: 34.99, qty: 1 },
      { name: "Cable Management Kit", price: 5.52, qty: 1 },
    ],
  },
];

function DemoReceiptSheet({
  receipt,
  open,
  onClose,
}: {
  receipt: DemoReceipt | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!receipt) return null;
  const Icon = categoryIcon(receipt.category);
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl px-0 pt-0 pb-0 flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">{receipt.merchant}</p>
            <p className="text-xs text-muted-foreground">{receipt.date}</p>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${categoryStyle(receipt.category)}`}>
            {receipt.category}
          </span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Total */}
          <div className="flex items-center gap-3">
            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${categoryStyle(receipt.category)}`}>
              <Icon className="w-[1.375rem] h-[1.375rem]" />
            </span>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">
                ${receipt.total.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Total</p>
            </div>
          </div>

          {/* Summary */}
          {receipt.summary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
              <p className="text-sm text-muted-foreground">{receipt.summary}</p>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Items</p>
            <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {receipt.products.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 bg-background">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.qty > 1 && <p className="text-xs text-muted-foreground">Qty {p.qty}</p>}
                  </div>
                  <span className="font-mono text-sm font-semibold shrink-0">${p.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Demo notice */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>This is sample data. Your real receipts will look like this.</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DemoView({ onScan }: { onScan: () => void }) {
  const [selected, setSelected] = useState<DemoReceipt | null>(null);
  const notableItems = DEMO_RECEIPTS.filter((r) => r.notableItem).slice(0, 2);

  return (
    <>
      <DemoReceiptSheet receipt={selected} open={selected !== null} onClose={() => setSelected(null)} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">
        {/* Notable items carousel */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Worth keeping</h2>
          <div className="grid grid-cols-2 gap-3">
              {notableItems.map((item) => {
                const Icon = categoryIcon(item.category);
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="block rounded-2xl border border-border p-4 flex flex-col gap-2 text-left hover:bg-secondary/50 transition-colors active:scale-95"
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
                      <Icon className="w-[1.1rem] h-[1.1rem]" />
                    </span>
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{item.notableItem}</p>
                    {item.itemPrice != null && (
                      <p className="font-mono font-bold text-base">${item.itemPrice.toFixed(2)}</p>
                    )}
                    <div className="mt-auto">
                      <p className="text-xs text-muted-foreground truncate">{item.merchant}</p>
                    </div>
                  </button>
                );
              })}
          </div>
        </section>

        {/* Recent list */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recent</h2>
          <ul className="divide-y divide-border">
            {DEMO_RECEIPTS.map((r) => {
              const Icon = categoryIcon(r.category);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    className="w-full flex items-center justify-between gap-4 py-4 group text-left"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(r.category)}`}>
                        <Icon className="w-[1.1rem] h-[1.1rem]" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate group-hover:underline">{r.merchant}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">{r.date}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${categoryStyle(r.category)}`}>
                            {r.category}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-semibold shrink-0">${r.total.toFixed(2)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </motion.div>
    </>
  );
}

function ReceiptRow({ r, index }: { r: Receipt; index: number }) {
  const Icon = categoryIcon(r.category);
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
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(r.category)}`}>
            {r.status === "processing" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Icon className="w-[1.1rem] h-[1.1rem]" />
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
  const [, setLocation] = useLocation();
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

  const showFab = true;

  return (
    <>
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
                      className="grid grid-cols-2 gap-3"
                      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
                      initial="hidden"
                      animate="visible"
                    >
                      {notableItems.slice(0, 2).map((item, i) => (
                        <motion.div key={i} variants={cardVariants} className="min-w-0">
                          {(() => {
                            const CardIcon = categoryIcon(item.category);
                            return (
                              <Link
                                href={`/receipts/${item.receiptId}`}
                                className="block w-full h-full rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-secondary/50 transition-colors"
                              >
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
                                  <CardIcon className="w-[1.1rem] h-[1.1rem]" />
                                </span>
                                <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
                                {item.price != null && (
                                  <p className="font-mono font-bold text-base">
                                    {currencySymbol(item.currency)}{item.price.toFixed(2)}
                                  </p>
                                )}
                                <div className="mt-auto flex flex-col gap-1">
                                  {item.merchant && (
                                    <p className="text-xs text-muted-foreground truncate">{item.merchant}</p>
                                  )}
                                </div>
                              </Link>
                            );
                          })()}
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
                      className="divide-y divide-border"
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
                  import.meta.env.DEV ? (
                    <DemoView onScan={() => setLocation("/scan")} />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center px-8 py-16 text-center gap-5"
                    >
                      <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center">
                        <ScanLine className="w-9 h-9 text-muted-foreground" />
                      </div>
                      <div className="space-y-2 max-w-xs">
                        <h2 className="text-xl font-extrabold tracking-tight">No receipts yet.</h2>
                        <p className="text-sm text-muted-foreground">
                          Scan your first receipt to build your searchable purchase history.
                        </p>
                      </div>
                      <Button
                        className="rounded-full h-12 px-8 font-semibold"
                        onClick={() => setLocation("/scan")}
                      >
                        Scan Receipt
                      </Button>
                    </motion.div>
                  )
                ) : null}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>

    {/* Floating scan button — mobile only, visible when there are receipts */}
    <AnimatePresence>
      {showFab && (
        <motion.button
          key="fab"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileTap={{ scale: 0.88 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          onClick={() => setLocation("/scan")}
          aria-label="Scan receipt"
          className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-xl"
          style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <Camera className="w-6 h-6" />
        </motion.button>
      )}
    </AnimatePresence>
    </>
  );
}

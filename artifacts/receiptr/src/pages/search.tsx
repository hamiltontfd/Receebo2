import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useGuestMode } from "@/components/GuestProvider";
import { useOnboarding } from "@/lib/useOnboarding";
import { OnboardingCard } from "@/components/OnboardingCard";
import PendingImports from "@/components/PendingImports";
import { useToast } from "@/hooks/use-toast";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}
import { format } from "date-fns";
import { Search as SearchIcon, Loader2, ScanLine, Camera, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useListReceipts, useInfiniteListReceipts, useGetRecentReceipts } from "@workspace/api-client-react";
import type { Receipt } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";
import { CATEGORIES, categoryStyle, categoryIcon } from "@/lib/categories";
import {
  PageTransition,
  listVariants,
  itemVariants,
  cardVariants,
} from "@/components/PageTransition";
import { ReceiptSheet } from "@/components/ReceiptSheet";

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
    summary: "Home furnishing run — bookshelf, throw pillows, and storage boxes.",
    products: [
      { name: "KALLAX Shelf Unit", price: 139.00, qty: 1 },
      { name: "SANELA Cushion Cover (2-pack)", price: 29.99, qty: 1 },
      { name: "KUGGIS Storage Box (4-pack)", price: 19.99, qty: 1 },
      { name: "RÅSKOG Cart", price: 24.99, qty: 1 },
    ],
  },
];

const notableDemoItems = DEMO_RECEIPTS.flatMap((r) =>
  r.notableItem && r.itemPrice
    ? [{ name: r.notableItem, price: r.itemPrice, merchant: r.merchant, category: r.category }]
    : [],
);

function DemoReceiptSheet({
  receipt,
  open,
  onClose,
}: {
  receipt: DemoReceipt | null;
  open: boolean;
  onClose: () => void;
}) {
  const isDesktop = useIsDesktop();
  if (!receipt) return null;
  const Icon = categoryIcon(receipt.category);
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={
          isDesktop
            ? "w-[520px] max-w-full p-0 flex flex-col overflow-hidden [&>button]:hidden"
            : "h-[85dvh] p-0 flex flex-col overflow-hidden rounded-t-2xl"
        }
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex justify-center pt-3 pb-2 shrink-0">
            <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
          </div>
        )}
        {/* Desktop close button */}
        {isDesktop && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(receipt.category)}`}>
                <Icon className="w-[1.1rem] h-[1.1rem]" />
              </span>
              <div>
                <p className="font-bold leading-tight">{receipt.merchant}</p>
                <p className="text-xs text-muted-foreground">{receipt.date}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-10 flex flex-col gap-5">
          <div className="rounded-2xl bg-foreground text-background p-6 space-y-3">
            <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-lg px-2 py-1">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">{receipt.category}</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">{receipt.merchant}</h2>
            <p className="text-sm opacity-70">{receipt.date}</p>
            <p className="text-4xl font-extrabold tracking-tight font-mono">
              ${receipt.total.toFixed(2)}
            </p>
          </div>

          <div className="rounded-2xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Purchased</p>
            <ul className="space-y-2">
              {receipt.products.map((p, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{p.qty > 1 ? `×${p.qty} ` : ""}{p.name}</span>
                  <span className="font-mono font-medium">${p.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">AI Summary</p>
            <p className="text-sm leading-relaxed">{receipt.summary}</p>
          </div>

          <div className="rounded-xl border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            <span>This is sample data. Sign in to scan and store your own receipts.</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DemoView({ onScan }: { onScan: () => void }) {
  const [selected, setSelected] = useState<DemoReceipt | null>(null);
  return (
    <>
      <DemoReceiptSheet receipt={selected} open={!!selected} onClose={() => setSelected(null)} />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-5"
      >
        <div className="flex items-center gap-2 rounded-xl border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>This is sample data. Scan a receipt to start your own library.</span>
          <button
            onClick={onScan}
            className="ml-auto shrink-0 text-foreground font-semibold underline underline-offset-2"
          >
            Scan now
          </button>
        </div>

        {notableDemoItems.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Worth keeping
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {notableDemoItems.slice(0, 2).map((item, i) => {
                const CardIcon = categoryIcon(item.category);
                return (
                  <div key={i} className="min-w-0">
                    <button
                      onClick={() => setSelected(DEMO_RECEIPTS.find((r) => r.merchant === item.merchant) ?? null)}
                      className="block w-full h-full rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-secondary/50 transition-colors text-left"
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(item.category)}`}>
                        <CardIcon className="w-[1.1rem] h-[1.1rem]" />
                      </span>
                      <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
                      <p className="font-mono font-bold text-base">${item.price.toFixed(2)}</p>
                      <div className="mt-auto">
                        <p className="text-xs text-muted-foreground truncate">{item.merchant}</p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recent</h2>
          <ul className="divide-y divide-border">
            {DEMO_RECEIPTS.map((r) => {
              const Icon = categoryIcon(r.category);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    className="w-full flex items-center justify-between gap-4 py-4 text-left"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(r.category)}`}>
                        <Icon className="w-[1.1rem] h-[1.1rem]" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.merchant}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">{r.date}</span>
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

function ReceiptRow({ r, onOpen, query }: { r: Receipt; onOpen: (id: number) => void; query?: string }) {
  const Icon = categoryIcon(r.category);

  const matchingItems = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const items: { name: string; price?: number | null }[] = [];

    // Skip zero-price items (shipping fees, discounts, etc.)
    const isUseful = (price: number | null | undefined) => price == null || price > 0;

    // Notable items first
    for (const n of r.notableItems ?? []) {
      if (n.name.toLowerCase().includes(q) && !seen.has(n.name) && isUseful(n.price)) {
        seen.add(n.name);
        items.push({ name: n.name, price: n.price ?? null });
      }
    }
    // Then products
    for (const p of r.products ?? []) {
      if (p.name.toLowerCase().includes(q) && !seen.has(p.name) && isUseful(p.price)) {
        seen.add(p.name);
        items.push({ name: p.name, price: p.price ?? null });
      }
    }

    // Fallback: if no name matched (receipt found via OCR/other text), show top
    // items so the card is never empty when the receipt has line items.
    if (items.length === 0) {
      for (const n of r.notableItems ?? []) {
        if (!seen.has(n.name) && isUseful(n.price)) {
          seen.add(n.name);
          items.push({ name: n.name, price: n.price ?? null });
          if (items.length >= 2) break;
        }
      }
      if (items.length < 2) {
        for (const p of r.products ?? []) {
          if (!seen.has(p.name) && isUseful(p.price)) {
            seen.add(p.name);
            items.push({ name: p.name, price: p.price ?? null });
            if (items.length >= 2) break;
          }
        }
      }
    }

    return items.slice(0, 4);
  }, [query, r.notableItems, r.products]);

  return (
    <motion.li
      variants={itemVariants}
      layout
    >
      <button
        onClick={() => onOpen(r.id)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left group"
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
            </div>
          </div>
        </div>
        {r.total != null && (
          <span className="font-mono font-semibold shrink-0">
            {currencySymbol(r.currency)}{r.total.toFixed(2)}
          </span>
        )}
      </button>
      {matchingItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pb-3">
          {matchingItems.map((item, i) => (
            <button
              key={i}
              onClick={() => onOpen(r.id)}
              className="block w-full rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-secondary/50 transition-colors text-left"
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(r.category)}`}>
                <Icon className="w-[1.1rem] h-[1.1rem]" />
              </span>
              <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
              {item.price != null && (
                <p className="font-mono font-bold text-base">
                  {currencySymbol(r.currency)}{item.price.toFixed(2)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </motion.li>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { isGuest } = useGuestMode();
  const { isSignedIn } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const onboarding = useOnboarding();

  // Show a welcome toast when the user lands after Stripe Checkout, then
  // immediately clear the param so it doesn't reappear on refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    // Strip the param from the URL without adding a history entry
    params.delete("checkout");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
    window.history.replaceState(null, "", newUrl);

    toast({
      title: "Subscription active",
      description: "Thanks for subscribing. Unlimited scans are now available.",
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length > 0 && onboarding.step1Done) {
      onboarding.markSearchDone();
    }
  }, [debounced, onboarding.step1Done]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSearching = debounced.length > 0;

  // Notable items grid — always fetches the 10 most recent for the "Worth keeping" section
  const { data: recent, isLoading: recentLoading } = useGetRecentReceipts({ limit: 10 });

  // Full paginated list — powers the idle receipt list with infinite scroll
  const {
    data: infiniteData,
    isLoading: idleLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteListReceipts(undefined, { query: { enabled: !isSearching } });

  // Flatten all pages into a single receipt array
  const allReceipts = useMemo(
    () =>
      (infiniteData?.pages ?? [])
        .flatMap((p) => p?.items ?? [])
        .filter((r): r is typeof r => r != null && typeof r === "object"),
    [infiniteData],
  );

  // Search results (non-paginated, all matches)
  const { data: searchPage, isLoading: searchLoading } = useListReceipts(
    isSearching ? { q: debounced } : undefined,
    { query: { enabled: isSearching } },
  );
  const results = searchPage?.items;

  // Sentinel ref — triggers fetchNextPage when it enters the viewport
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    <ReceiptSheet
      receiptId={selectedId}
      open={selectedId !== null}
      onClose={() => setSelectedId(null)}
    />

    <PageTransition className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-5">

      {/* Onboarding checklist — signed-in users only */}
      {isSignedIn && !onboarding.dismissed && (
        <OnboardingCard
          {...onboarding}
          onFocusSearch={() => searchInputRef.current?.focus()}
        />
      )}

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
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

      {/* Pending email imports — signed-in users only */}
      {isSignedIn && !isGuest && <PendingImports />}

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
                  <ReceiptRow key={r.id} r={r} onOpen={setSelectedId} query={debounced} />
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
            {(idleLoading && allReceipts.length === 0) || (recentLoading && notableItems.length === 0) ? (
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
                              <button
                                onClick={() => setSelectedId(item.receiptId)}
                                className="block w-full h-full rounded-2xl border border-border p-4 flex flex-col gap-2 hover:bg-secondary/50 transition-colors text-left"
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
                              </button>
                            );
                          })()}
                        </motion.div>
                      ))}
                    </motion.div>
                  </section>
                )}

                {allReceipts.length > 0 ? (
                  <section>
                    <motion.ul
                      className="divide-y divide-border"
                      variants={listVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {allReceipts.flatMap((r, i) => {
                        const year = new Date(r.createdAt).getFullYear();
                        const prevYear = i > 0 ? new Date(allReceipts[i - 1].createdAt).getFullYear() : null;
                        const showYearSep = prevYear !== null && year !== prevYear;
                        const nodes = [];
                        if (showYearSep) {
                          nodes.push(
                            <li key={`year-${year}`} className="!border-t-0 list-none" aria-hidden>
                              <div className="flex items-center gap-3 py-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-xs font-semibold text-muted-foreground/60 tabular-nums tracking-wider">{year}</span>
                                <div className="flex-1 h-px bg-border" />
                              </div>
                            </li>
                          );
                        }
                        nodes.push(<ReceiptRow key={r.id} r={r} onOpen={setSelectedId} />);
                        return nodes;
                      })}
                    </motion.ul>

                    {/* Infinite scroll sentinel */}
                    <div ref={sentinelRef} className="h-1" />

                    {isFetchingNextPage && (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </section>
                ) : !idleLoading ? (
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
          style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom) + var(--install-bar-h, 0px))" }}
        >
          <Camera className="w-6 h-6" />
        </motion.button>
      )}
    </AnimatePresence>
    </>
  );
}

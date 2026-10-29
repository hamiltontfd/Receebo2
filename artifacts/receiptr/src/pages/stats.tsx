import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Mail, ScanLine } from "lucide-react";
import { getListReceiptsQueryKey, listReceipts, type Receipt } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptSheet } from "@/components/ReceiptSheet";
import { PageTransition } from "@/components/PageTransition";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import {
  deadlineUrgency, expiringChart, formatAmount, protectionCaption, summarizeProtected, worthKeeping,
  type Bucket, type ExpiringChart, type ProtectedEntry, type ProtectedSummary, type WorthKeepingItem,
} from "@/lib/protectedValue";

const PAGE_SIZE = 50;
const MAX_PAGES = 40;
const VIOLET = "#B9A7FB";
const SOON_ROWS = 5;

/** Every library receipt (paged through the existing list endpoint). */
async function fetchAllReceipts(): Promise<Receipt[]> {
  const all: Receipt[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await listReceipts({ limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
    all.push(...(page?.items ?? []).filter((r): r is Receipt => r != null && typeof r === "object"));
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

export function useAllReceipts() {
  // Under the list key, so every existing invalidation (save, delete, import) refreshes Stats.
  return useQuery({
    queryKey: [...getListReceiptsQueryKey(), "stats-all"],
    queryFn: fetchAllReceipts,
    staleTime: 30_000,
  });
}

const sectionLabel = "text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

export default function StatsPage() {
  const { data: receipts, isLoading, isError } = useAllReceipts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [days, setDays] = useState<30 | 60 | 90>(90);
  const [filter, setFilter] = useState<Bucket | null>(null);
  const [showAll, setShowAll] = useState(false);

  const now = useMemo(() => new Date(), [receipts]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarizeProtected(receipts ?? [], now), [receipts, now]);
  const chart = useMemo(() => expiringChart(summary, days, now), [summary, days, now]);
  const keep = useMemo(() => worthKeeping(receipts ?? [], summary, now), [receipts, summary, now]);

  return (
    <>
      <ReceiptSheet receiptId={selectedId} open={selectedId !== null} onClose={() => setSelectedId(null)} />
      <PageTransition className="flex-1 w-full max-w-lg md:max-w-5xl mx-auto px-5 md:px-8 py-6 md:py-10">
        {isLoading ? (
          <div className="space-y-4" data-testid="stats-loading">
            <Skeleton className="h-3.5 w-28 rounded-full" />
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground py-16 text-center">Couldn't load your purchases. Check your connection and try again.</p>
        ) : summary.receiptCount === 0 ? (
          <EmptyCard />
        ) : summary.entries.length === 0 && summary.expiredCount === 0 ? (
          <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground" data-testid="stats-no-dated">
            No purchases with a return window or warranty yet.
            <Footnote />
          </div>
        ) : (
          <Dashboard
            summary={summary}
            chart={chart}
            days={days}
            onDays={setDays}
            keep={keep}
            filter={filter}
            onFilter={(b) => { setFilter((f) => (f === b ? null : b)); setShowAll(false); }}
            showAll={showAll}
            onShowAll={() => setShowAll((v) => !v)}
            onOpen={setSelectedId}
            now={now}
          />
        )}
      </PageTransition>
    </>
  );
}

function Dashboard({
  summary, chart, days, onDays, keep, filter, onFilter, showAll, onShowAll, onOpen, now,
}: {
  summary: ProtectedSummary; chart: ExpiringChart; days: 30 | 60 | 90; onDays: (d: 30 | 60 | 90) => void;
  keep: WorthKeepingItem[]; filter: Bucket | null; onFilter: (b: Bucket) => void;
  showAll: boolean; onShowAll: () => void; onOpen: (id: number) => void; now: Date;
}) {
  const nothing = summary.counted.length === 0;
  const listSource: ProtectedEntry[] = filter
    ? summary.entries.filter((e) => e.bucket === filter)
        .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || b.amount - a.amount)
    : summary.counted;
  const rows = showAll ? listSource : listSource.slice(0, SOON_ROWS);
  const canViewAll = listSource.length > SOON_ROWS;

  return (
    <div className="grid gap-5 md:grid-cols-2 md:gap-x-10 md:items-start">
      {/* Left column: hero, groups, chart, exclusion note (desktop) */}
      <div className="flex flex-col gap-4">
        <Hero summary={summary} nothing={nothing} />
        <Groups summary={summary} filter={filter} onFilter={onFilter} />
        {!nothing && <Chart chart={chart} days={days} onDays={onDays} currency={summary.primaryCurrency} />}
        <div className="hidden md:block"><Footnote align="left" /></div>
      </div>

      {/* Right column: Expiring soon, Worth keeping */}
      <div className="flex flex-col gap-6">
        {rows.length > 0 && (
          <section data-testid="stats-expiring">
            <div className="flex items-center justify-between mb-1">
              <h2 className={sectionLabel}>
                {filter === "unknown" ? "Return deadline unknown" : filter === "warranty" ? "Warranty" : filter === "return" ? "Return window" : "Expiring soon"}
              </h2>
              {(canViewAll || filter) && (
                <button
                  type="button"
                  onClick={filter && !canViewAll ? () => onFilter(filter) : onShowAll}
                  className="text-xs text-muted-foreground inline-flex items-center gap-0.5 hover:text-foreground"
                  data-testid="stats-view-all"
                >
                  {filter && !canViewAll ? "Show all" : showAll ? "Show less" : "View all"}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <ul className="divide-y divide-border">
              {rows.map((e) => <SoonRow key={e.receiptId} e={e} onOpen={onOpen} now={now} />)}
            </ul>
          </section>
        )}

        {keep.length > 0 && (
          <section data-testid="stats-worth-keeping">
            <h2 className={`${sectionLabel} mb-3`}>Worth keeping</h2>
            <div className="grid grid-cols-2 gap-3">
              {keep.map((item, i) => {
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
        )}

        <div className="md:hidden"><Footnote /></div>
      </div>
    </div>
  );
}

function Hero({ summary, nothing }: { summary: ProtectedSummary; nothing: boolean }) {
  return (
    <div data-testid="stats-hero">
      <p className={sectionLabel}>Protected value</p>
      <p
        className={`font-mono font-bold text-[34px] leading-[42px] tracking-[-0.02em] mt-1 ${nothing ? "text-muted-foreground/60" : ""}`}
        data-testid="stats-total"
      >
        {formatAmount(summary.total, summary.primaryCurrency)}
      </p>
      {summary.otherTotals.length > 0 && (
        <p className="font-mono text-xs text-muted-foreground mt-0.5" data-testid="stats-other-currencies">
          {summary.otherTotals.map((t) => `+ ${formatAmount(t.amount, t.currency)}`).join("  ")}
        </p>
      )}
      {nothing && <p className="text-sm text-muted-foreground mt-2">Nothing protected right now.</p>}
    </div>
  );
}

function Groups({ summary, filter, onFilter }: { summary: ProtectedSummary; filter: Bucket | null; onFilter: (b: Bucket) => void }) {
  const us = summary.primaryCurrency === "USD";
  const rows: { bucket: Bucket; label: string; dot: React.ReactNode }[] = [
    { bucket: "return", label: "Return window", dot: <span className="w-2 h-2 rounded-full bg-[#121212]" /> },
    { bucket: "warranty", label: us ? "Manufacturer warranty" : "Warranty", dot: <span className="w-2 h-2 rounded-full" style={{ background: VIOLET }} /> },
    { bucket: "unknown", label: "Return deadline unknown", dot: <span className="w-2 h-2 rounded-full border border-muted-foreground/60" /> },
  ];
  return (
    <div className="rounded-2xl border divide-y" data-testid="stats-groups">
      {rows.filter((r) => r.bucket !== "unknown" || summary.groups.unknown.count > 0).map(({ bucket, label, dot }) => {
        const g = summary.groups[bucket];
        const muted = bucket === "unknown";
        return (
          <button
            key={bucket}
            type="button"
            onClick={() => onFilter(bucket)}
            aria-pressed={filter === bucket}
            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${filter === bucket ? "bg-secondary/60" : "hover:bg-secondary/40"} first:rounded-t-2xl last:rounded-b-2xl`}
            data-testid={`stats-group-${bucket}`}
          >
            <span className="shrink-0 flex">{dot}</span>
            {/* Label and count may wrap (count drops below the label on narrow phones); the amount never breaks. */}
            <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{g.count}{muted ? " · not counted" : ""}</span>
            </span>
            <span className={`ml-auto shrink-0 whitespace-nowrap font-mono text-sm font-semibold ${muted ? "text-muted-foreground" : ""}`}>
              {formatAmount(g.amount, summary.primaryCurrency)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Chart({ chart, days, onDays, currency }: { chart: ExpiringChart; days: 30 | 60 | 90; onDays: (d: 30 | 60 | 90) => void; currency: string }) {
  const max = Math.max(...chart.bars.map((b) => b.returnAmount + b.warrantyAmount), 0);
  const H = 120;
  return (
    <div className="rounded-2xl border p-4" data-testid="stats-chart">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Expiring in {days} days</p>
          <p className="font-mono font-bold text-lg mt-0.5" data-testid="stats-chart-total">{formatAmount(chart.total, currency)}</p>
        </div>
        <div className="flex rounded-full bg-secondary p-0.5 text-xs" role="group" aria-label="Chart range">
          {([30, 60, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDays(d)}
              aria-pressed={days === d}
              className={`px-2.5 py-1 rounded-full ${days === d ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-end gap-1.5" style={{ height: H }} aria-hidden>
        {chart.bars.map((b, i) => {
          const total = b.returnAmount + b.warrantyAmount;
          const h = max > 0 ? Math.max(total > 0 ? 4 : 0, Math.round((total / max) * H)) : 0;
          const rh = total > 0 ? Math.round((b.returnAmount / total) * h) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end items-center h-full">
              {total > 0 ? (
                <div className="w-full max-w-[14px] flex flex-col justify-end rounded-t-[3px] overflow-hidden" style={{ height: h }}>
                  <div style={{ height: h - rh, background: VIOLET }} />
                  <div style={{ height: rh, background: "#121212" }} />
                </div>
              ) : (
                <div className="w-full max-w-[14px] h-[3px] rounded-full bg-[#EFEFEF]" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5 border-t pt-1.5" aria-hidden>
        {chart.bars.map((b, i) => (
          <span key={i} className="flex-1 text-[10px] text-muted-foreground whitespace-nowrap overflow-visible">{b.monthLabel ?? ""}</span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#121212]" />Return <span className="font-mono font-semibold text-foreground">{formatAmount(chart.returnTotal, currency)}</span></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: VIOLET }} />Warranty <span className="font-mono font-semibold text-foreground">{formatAmount(chart.warrantyTotal, currency)}</span></span>
      </div>
    </div>
  );
}

function SoonRow({ e, onOpen, now }: { e: ProtectedEntry; onOpen: (id: number) => void; now: Date }) {
  const Icon = categoryIcon(e.category);
  const urgency = deadlineUrgency(e.daysLeft, e.bucket);
  const caption = protectionCaption(e, now) ?? "No deadline";
  const color = urgency === "red" ? "text-red-600" : urgency === "amber" ? "text-amber-600" : "text-muted-foreground";
  return (
    <li>
      <button type="button" onClick={() => onOpen(e.receiptId)} className="w-full flex items-center gap-3 py-3 text-left group">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(e.category)}`}>
          <Icon className="w-[1.1rem] h-[1.1rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate group-hover:underline">{e.title}</span>
          <span className="block text-xs truncate mt-0.5">
            <span className={color} data-testid="stats-row-deadline">{caption}</span>
            {e.merchant && <span className="text-muted-foreground"> · {e.merchant}</span>}
          </span>
        </span>
        <span className="font-mono font-semibold shrink-0">{formatAmount(e.amount, e.currency)}</span>
      </button>
    </li>
  );
}

function Footnote({ align = "center" }: { align?: "center" | "left" }) {
  return (
    <p className={`text-xs text-muted-foreground mt-2 ${align === "center" ? "text-center" : ""}`} data-testid="stats-exclusion-note">
      Subscriptions, services and tickets aren't counted.
    </p>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-2xl border p-6 flex flex-col items-center text-center gap-4" data-testid="stats-empty">
      <span className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
        <ScanLine className="w-6 h-6 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">Nothing protected yet</p>
        <p className="text-sm text-muted-foreground">Add a receipt to see its return window and warranty here.</p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Link href="/scan" className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-background">
          Scan a receipt
        </Link>
        <Link href="/imports" className="inline-flex h-11 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold">
          <Mail className="w-4 h-4" />
          Import from Outlook
        </Link>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Loader2, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListReceipts, useGetReceiptStats } from "@workspace/api-client-react";
import type { Receipt as ReceiptItem } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";

function monthKey(r: ReceiptItem): string {
  const d = new Date(r.purchaseDate || r.createdAt);
  return format(d, "yyyy-MM");
}

export default function Library() {
  const [, setLocation] = useLocation();
  const { data: receipts, isLoading } = useListReceipts();
  const { data: stats } = useGetReceiptStats();

  const groups = useMemo(() => {
    if (!receipts) return [];
    const map = new Map<
      string,
      { label: string; year: string; items: ReceiptItem[]; total: number }
    >();
    for (const r of receipts) {
      const key = monthKey(r);
      const d = new Date(r.purchaseDate || r.createdAt);
      const entry = map.get(key) ?? {
        label: format(d, "MMMM"),
        year: format(d, "yyyy"),
        items: [],
        total: 0,
      };
      entry.items.push(r);
      entry.total += r.total ?? 0;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => ({ key, ...v }));
  }, [receipts]);

  const year = groups.length > 0 ? groups[0].year : format(new Date(), "yyyy");

  if (isLoading) {
    return (
      <div className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        {Array(5)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
      </div>
    );
  }

  if (!receipts || receipts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5 py-20">
        <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center">
          <Receipt className="w-9 h-9 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h2 className="text-xl font-extrabold tracking-tight">
            Your purchases will appear here.
          </h2>
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
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Library</h1>
          <p className="text-4xl font-extrabold tracking-tight mt-1">{year}</p>
        </div>
        {stats && (
          <p className="text-sm text-muted-foreground pb-1">
            {stats.totalReceipts} purchase{stats.totalReceipts === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold">
                {group.year === year ? group.label : `${group.label} ${group.year}`}
              </h2>
              <span className="text-sm text-muted-foreground">
                {group.items.length}
              </span>
            </div>
            <ul className="divide-y border-t">
              {group.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/receipts/${r.id}`}
                    className="flex items-center justify-between gap-4 py-4 group"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
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
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(r.purchaseDate || r.createdAt), "MMM d")}
                          {r.category ? ` · ${r.category}` : ""}
                        </p>
                      </div>
                    </div>
                    {r.total != null && (
                      <span className="font-mono font-semibold shrink-0">
                        {currencySymbol(r.currency)}{r.total.toFixed(2)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-right text-xs text-muted-foreground mt-2 font-mono">
              {currencySymbol(group.items[0]?.currency)}{group.total.toFixed(2)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

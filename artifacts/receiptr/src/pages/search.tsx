import { useEffect, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search as SearchIcon, Loader2, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListReceipts } from "@workspace/api-client-react";
import { currencySymbol } from "@/lib/currency";

const QUICK_FILTERS = ["Electronics", "Groceries", "Clothing", "Travel"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const { data: receipts, isLoading } = useListReceipts({
    q: debounced || undefined,
  });

  return (
    <div className="flex-1 w-full max-w-lg md:max-w-3xl mx-auto px-5 py-6 flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Search</h1>

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
        {QUICK_FILTERS.map((f) => (
          <Button
            key={f}
            variant={query === f ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setQuery(query === f ? "" : f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
        </div>
      ) : receipts && receipts.length > 0 ? (
        <ul className="divide-y">
          {receipts.map((r) => (
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
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.purchaseDate || r.createdAt), "MMM d, yyyy")}
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
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {debounced
            ? "No purchases match your search."
            : "Search by merchant, item, category, or amount."}
        </div>
      )}
    </div>
  );
}

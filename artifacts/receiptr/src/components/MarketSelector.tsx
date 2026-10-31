import { useId, useState } from "react";
import { Loader2, Info, Globe, ChevronDown, Check, AlertCircle } from "lucide-react";
import { useMarket } from "@/components/MarketProvider";
import { getMarketCopy } from "@/lib/marketCopy";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Market = "PT" | "BR" | "US";

/** Kept for compatibility; UI reads localized labels from getMarketCopy(). */
export const MARKET_LABELS: Record<Market, string> = {
  PT: "Portugal / European Union",
  BR: "Brazil",
  US: "United States",
};

const MARKETS: Market[] = ["PT", "BR", "US"];

interface MarketSelectorProps {
  /** compact = nav dropdown trigger; full = labelled select with explanation. */
  variant?: "compact" | "full";
  className?: string;
}

export function MarketSelector({ variant = "full", className = "" }: MarketSelectorProps) {
  const { market, source, confirmed, loading, saving, error, choose, retry } = useMarket();
  const copy = getMarketCopy();
  const id = useId();
  const [showInfo, setShowInfo] = useState(false);
  const isSuggestion = !!market && !confirmed && source === "suggestion";
  const isUnknown = !market;

  const disclaimer = (
    <p id={`market-help-${id}`} className="text-xs text-muted-foreground leading-relaxed">
      {copy.disclaimer}
    </p>
  );

  if (variant === "compact") {
    const short = market ? copy.shortLabels[market] : copy.region;
    return (
      <div className={`inline-flex ${className}`} data-testid="market-selector">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            disabled={loading}
            aria-label={market ? `${copy.region}: ${copy.labels[market]}` : copy.chooseMarket}
            aria-describedby={`market-help-${id}`}
            data-testid="select-market"
            className="group inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold tracking-wide text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/5 data-[state=open]:text-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="status-market-saving" />
            ) : error ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            <span className={market ? "uppercase" : "font-medium"} data-testid="text-market-current">{short}</span>
            {isSuggestion && <span aria-hidden className="h-1 w-1 rounded-full bg-foreground/40" />}
            <ChevronDown className="h-3 w-3 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-72 rounded-xl p-1.5">
            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {copy.region}
            </DropdownMenuLabel>
            {isSuggestion && market && (
              <div className="mx-1 mb-1.5 rounded-lg bg-secondary px-2.5 py-2 text-xs" data-testid="status-market-suggestion">
                <p className="text-muted-foreground">{copy.suggestion}</p>
                <button
                  type="button"
                  onClick={() => void choose(market)}
                  className="mt-1 font-semibold text-foreground underline underline-offset-2"
                  data-testid="button-market-confirm"
                >
                  {copy.confirm} {copy.labels[market]}
                </button>
              </div>
            )}
            {!saving && error && (
              <div role="alert" className="mx-1 mb-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive" data-testid="status-market-error">
                {error}{" "}
                <button type="button" onClick={retry} className="font-semibold underline underline-offset-2" data-testid="button-market-retry">
                  {copy.retry}
                </button>
              </div>
            )}
            <DropdownMenuRadioGroup value={market ?? ""} onValueChange={(v) => { if (v) void choose(v as Market); }}>
              {MARKETS.map((m) => (
                <DropdownMenuRadioItem
                  key={m}
                  value={m}
                  disabled={saving}
                  className="rounded-md py-2 text-sm"
                  data-testid={`option-market-${m}`}
                >
                  <span className="flex-1">{copy.labels[m]}</span>
                  <span className="ml-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{copy.shortLabels[m]}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {confirmed && market && (
              <p className="flex items-center gap-1 px-2 pt-1 text-[11px] text-muted-foreground"><Check className="h-3 w-3" />{copy.confirmed}</p>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); setShowInfo((v) => !v); }}
              aria-expanded={showInfo}
              className="rounded-md text-xs text-muted-foreground"
              data-testid="button-market-info"
            >
              <Info className="mr-2 h-3.5 w-3.5" /> {copy.aboutRegion}
            </DropdownMenuItem>
            <div className={showInfo ? "px-2 pb-1.5 pt-1" : "sr-only"}>{disclaimer}</div>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="sr-only" aria-live="polite">{saving ? copy.saving : error ?? ""}</span>
      </div>
    );
  }

  const select = (
    <select
      id={`market-${id}`}
      data-testid="select-market"
      aria-describedby={`market-help-${id}`}
      disabled={loading || saving}
      value={market ?? ""}
      onChange={(e) => { if (e.target.value) void choose(e.target.value as Market); }}
      className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      {isUnknown && <option value="">{copy.chooseMarket}</option>}
      {MARKETS.map((m) => <option key={m} value={m}>{copy.labels[m]}</option>)}
    </select>
  );

  return (
    <div className={`space-y-2 ${className}`} data-testid="market-selector">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`market-${id}`} className="text-sm font-medium">{copy.region}</label>
        {confirmed && market && <span className="text-xs text-muted-foreground">{copy.confirmed}</span>}
      </div>
      {loading ? <div className="h-10 w-full rounded-lg bg-secondary animate-pulse" /> : select}
      <div aria-live="polite" className="text-xs">
        {saving && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground" data-testid="status-market-saving">
            <Loader2 className="w-3 h-3 animate-spin" /> {copy.saving}
          </span>
        )}
        {!saving && error && (
          <span role="alert" className="inline-flex flex-wrap items-center gap-2 text-destructive" data-testid="status-market-error">
            {error}
            <button type="button" onClick={retry} className="font-semibold underline underline-offset-2" data-testid="button-market-retry">
              {copy.retry}
            </button>
          </span>
        )}
        {!saving && !error && isSuggestion && market && (
          <span className="inline-flex flex-wrap items-center gap-2 text-muted-foreground" data-testid="status-market-suggestion">
            {copy.suggestion}
            <button type="button" onClick={() => void choose(market)} className="font-semibold text-foreground underline underline-offset-2" data-testid="button-market-confirm">
              {copy.confirm} {copy.labels[market]}
            </button>
          </span>
        )}
        {!saving && !error && isUnknown && !loading && (
          <span className="text-muted-foreground" data-testid="status-market-unknown">{copy.unknown}</span>
        )}
      </div>
      {disclaimer}
    </div>
  );
}

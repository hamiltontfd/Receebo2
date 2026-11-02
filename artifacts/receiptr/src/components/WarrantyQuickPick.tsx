/**
 * Warranty alerts quick pick (US mode, Hamilton 29 Oct 2026; copy 2 Nov 2026):
 * 1 / 2 / 3 years / Other above the warranty text field, US-market accounts only.
 * A year button saves the same free text the field already holds ("2-year
 * manufacturer warranty"), so there is no new column: the app and the
 * reminder sweep parse it as before. "Other" hands focus to the text field.
 * The preview shows the end date the manufacturer reminder will use (counted
 * from the purchase date). No "while you're subscribed" (Hamilton, 2 Nov 2026).
 */
import { addMonthsClamped, parseManufacturerWarrantyMonths } from "@/lib/consumerRights";
import { appText } from "@/lib/appCopy";
import { formatLocaleDate, useAppLocale, type AppLocale } from "@/lib/locale";

export const WARRANTY_QUICK_YEARS = [1, 2, 3] as const;

/** Stored text (kept in English: it is receipt data the parsers read, not interface copy). */
export function warrantyTextForYears(years: number): string {
  return `${years}-year manufacturer warranty`;
}

/** End date for a warranty text in the app locale ("Nov 27, 2028" in English), or null without a length or a purchase date. */
export function warrantyEndPreview(text: string | null | undefined, purchaseDate: string | null | undefined, locale: AppLocale = "en"): string | null {
  const months = parseManufacturerWarrantyMonths(text);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(purchaseDate ?? "");
  if (months == null || !m) return null;
  const end = addMonthsClamped(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), months);
  return formatLocaleDate(end, locale);
}

export function WarrantyQuickPick({ value, onChange, purchaseDate, onOther }: {
  value: string;
  onChange: (text: string) => void;
  purchaseDate: string | null | undefined;
  /** Focus the free text field. */
  onOther?: () => void;
}) {
  const locale = useAppLocale();
  const months = parseManufacturerWarrantyMonths(value);
  const selectedYears = months != null && months % 12 === 0 && WARRANTY_QUICK_YEARS.includes((months / 12) as 1 | 2 | 3) ? months / 12 : null;
  const isOther = selectedYears === null && value.trim() !== "";
  const end = warrantyEndPreview(value, purchaseDate, locale);
  const chip = (active: boolean) =>
    `h-8 rounded-full border px-3 text-xs font-medium transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background hover:bg-muted"}`;
  return (
    <div className="space-y-1.5" data-testid="warranty-quick-pick">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={appText("Manufacturer warranty length")}>
        {WARRANTY_QUICK_YEARS.map((y) => (
          <button key={y} type="button" className={chip(selectedYears === y)} aria-pressed={selectedYears === y}
            data-testid={`button-warranty-${y}y`} onClick={() => onChange(warrantyTextForYears(y))}>
            {appText("{0} yr", [y])}
          </button>
        ))}
        <button type="button" className={chip(isOther)} aria-pressed={isOther} data-testid="button-warranty-other" onClick={() => onOther?.()}>
          {appText("Other length")}
        </button>
      </div>
      {end && (
        <p className="text-xs text-muted-foreground" data-testid="text-warranty-end-preview">
          {appText("Ends {0}. We'll remind you before it ends.", [end])}
        </p>
      )}
    </div>
  );
}

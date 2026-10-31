import { useId, useMemo } from "react";
import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";
import { countryName, countryOptions, normalizeCountry } from "@/lib/countries";

const UNKNOWN = "";

interface PurchaseCountryFieldProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Edit the country where the purchase was made. Full ISO list plus Unknown (null).
 * Native select for accessibility and search-by-typing on every device.
 */
export function PurchaseCountryField({
  value, onChange, className = "", labelClassName, disabled, id,
}: PurchaseCountryFieldProps) {
  const locale = useAppLocale();
  const autoId = useId();
  const selectId = id ?? `purchase-country-${autoId}`;
  const options = useMemo(() => countryOptions(locale), [locale]);
  const current = normalizeCountry(value);
  // Keep an unrecognised stored value visible rather than silently dropping it.
  const legacy = value && !current ? value : null;

  return (
    <div className={`space-y-1 ${className}`}>
      <label
        htmlFor={selectId}
        className={labelClassName ?? "text-xs font-semibold uppercase tracking-wide text-muted-foreground"}
      >
        {appText("Purchase country")}
      </label>
      <select
        id={selectId}
        data-testid="select-purchase-country"
        disabled={disabled}
        value={current ?? legacy ?? UNKNOWN}
        onChange={(e) => onChange(e.target.value === UNKNOWN ? null : e.target.value)}
        className="block w-full bg-transparent border-0 px-0 py-0 font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm disabled:opacity-50"
      >
        <option value={UNKNOWN}>{appText("Unknown")}</option>
        {legacy && <option value={legacy}>{legacy.toUpperCase()}</option>}
        {options.map((o) => (
          <option key={o.code} value={o.code}>{o.name}</option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{appText("Where you bought it. Not inferred from currency.")}</p>
    </div>
  );
}

/** Read-only display. Null shows "Unknown", never a guess. */
export function PurchaseCountryValue({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const locale = useAppLocale();
  const known = !!value;
  return (
    <span
      data-testid="text-purchase-country"
      className={`${known ? "" : "text-muted-foreground italic"} ${className}`}
    >
      {known ? countryName(value, locale) : appText("Unknown")}
    </span>
  );
}

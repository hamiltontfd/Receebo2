import { appText } from "@/lib/appCopy";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import { WarrantyInfo, type RightsReceipt } from "@/components/ConsumerRightsPanel";
import { deriveConsumerRights, merchantSuggestsOnline, unknownChannelRetailerNote } from "@/lib/consumerRights";
import { hasNoConsumerDates } from "@/lib/purchaseType";
import { useAccountRegion } from "@/lib/region";
import { formatLocaleDate, useAppLocale, type AppLocale } from "@/lib/locale";

export interface ShownContract {
  id: string;
  kind: "return" | "warranty";
  warrantyType?: "legal" | "manufacturer" | "commercial" | null;
  basis: "stated" | "user" | "rule";
  certainty: "confirmed" | "estimated" | "unknown";
  status: "open" | "expired" | "unknown" | "not_applicable";
  lengthDays?: number | null;
  lengthMonths?: number | null;
  endDate?: string | null;
  ruleId?: string | null;
  evidence?: string | null;
}

export interface ShownLine {
  lineId?: string | null;
  name: string;
  quantity?: number | null;
  price?: number | null;
  category?: string | null;
}

export interface ShownRights {
  lineId?: string | null;
  index: number;
  contracts: ShownContract[];
}

function sameCover(a: ShownContract, b: ShownContract): boolean {
  return a.kind === b.kind && (a.warrantyType ?? null) === (b.warrantyType ?? null)
    && a.basis === b.basis && a.certainty === b.certainty && a.status === b.status
    && (a.endDate ?? null) === (b.endDate ?? null) && (a.lengthMonths ?? null) === (b.lengthMonths ?? null)
    && (a.lengthDays ?? null) === (b.lengthDays ?? null) && (a.ruleId ?? null) === (b.ruleId ?? null);
}

function unique(contracts: ShownContract[]): ShownContract[] {
  const kept: ShownContract[] = [];
  for (const contract of contracts) {
    if (!kept.some((item) => sameCover(item, contract))) kept.push(contract);
  }
  return kept;
}

function contractsFor(line: ShownLine, index: number, rights: ShownRights[]): ShownContract[] {
  const hit = line.lineId
    ? rights.find((row) => row.lineId === line.lineId)
    : rights.find((row) => (row.lineId == null || row.lineId === "") && row.index === index);
  return unique(hit?.contracts ?? []);
}

function formatIso(iso: string | null | undefined, locale: AppLocale): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : formatLocaleDate(date, locale);
}

function duration(contract: ShownContract): string | null {
  if (contract.lengthMonths && contract.lengthMonths % 12 === 0) {
    const years = contract.lengthMonths / 12;
    return appText(years === 1 ? "{0} year" : "{0} years", [years]);
  }
  if (contract.lengthMonths) return appText(contract.lengthMonths === 1 ? "{0} month" : "{0} months", [contract.lengthMonths]);
  if (contract.lengthDays != null) return appText("{0} days", [contract.lengthDays]);
  return null;
}

function provenance(contract: ShownContract): string {
  if (contract.basis === "user") return appText("You saved this");
  if (contract.basis === "stated") return contract.evidence || appText("From the receipt");
  if (contract.warrantyType === "legal") return appText("Legal warranty");
  if (contract.warrantyType === "manufacturer") return appText("Manufacturer warranty");
  if (contract.warrantyType === "commercial") return appText("Commercial warranty");
  if (contract.ruleId?.startsWith("US:")) return contract.ruleId;
  return contract.ruleId || appText("From the receipt");
}

function returnTitle(contract: ShownContract, locale: AppLocale): string {
  if (!contract.endDate) {
    return contract.lengthDays != null ? appText("{0} days", [contract.lengthDays]) : appText("Return window unknown");
  }
  if (contract.status === "unknown") return appText("Return window unknown");
  const date = formatIso(contract.endDate, locale);
  if (contract.certainty === "estimated") return appText("Est. return by {0}", [date]);
  if (contract.status === "expired") return appText("Return window expired");
  return appText("Return by {0}", [date]);
}

function warrantyKindLabel(contract: ShownContract): string | null {
  if (contract.status === "unknown" || contract.status === "not_applicable") return null;
  if (contract.warrantyType === "legal") return appText("Legal");
  if (contract.warrantyType === "manufacturer") return appText("Manufacturer");
  if (contract.warrantyType === "commercial") return appText("Commercial warranty");
  return null;
}

function warrantyLine(contract: ShownContract, locale: AppLocale): string {
  const title = warrantyTitle(contract, locale);
  const kind = warrantyKindLabel(contract);
  return kind ? `${kind} · ${title}` : title;
}

function warrantyTitle(contract: ShownContract, locale: AppLocale): string {
  if (!contract.endDate) {
    const length = duration(contract);
    return length ?? appText("Warranty unknown");
  }
  if (contract.status === "unknown") return duration(contract) ?? appText("Warranty unknown");
  const length = duration(contract);
  const date = contract.endDate ? formatIso(contract.endDate, locale) : "";
  const core = length && date ? `${length} · ${date}` : length || date;
  return contract.certainty === "estimated" ? `${appText("Estimated")} · ${core}` : core;
}

function hasCoverage(contracts: ShownContract[]): boolean {
  return contracts.some((c) => c.status !== "unknown" && c.status !== "not_applicable");
}

export interface HighlightMatch<T extends { name: string }> {
  item: T;
  line: ShownLine | null;
  index: number;
}

/** Same match the highlight cards use: one exact name, never a guess. */
export function highlightMatches<T extends { name: string }>(
  products: readonly ShownLine[],
  notableItems: readonly T[] | null | undefined,
): HighlightMatch<T>[] {
  return (notableItems ?? []).map((item) => {
    const hits = products
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    const hit = hits.length === 1 ? hits[0] : null;
    return { item, line: hit?.line ?? null, index: hit?.index ?? -1 };
  });
}

export function ItemCoverageSections({
  products,
  notableItems,
  itemRights,
  symbol,
  receipt,
}: {
  products: ShownLine[];
  notableItems?: ReadonlyArray<{ name: string; price?: number | null; category?: string | null }> | null;
  itemRights?: ShownRights[] | null;
  symbol: string;
  receipt?: RightsReceipt | null;
}) {
  const locale = useAppLocale();
  const { region, ready } = useAccountRegion();
  const derived = receipt && ready ? deriveConsumerRights({
    purchaseDate: receipt.purchaseDate,
    deliveryDate: receipt.deliveryDate,
    category: receipt.category,
    currency: receipt.currency,
    purchaseCountry: receipt.purchaseCountry,
    isOnlinePurchase: receipt.isOnlinePurchase,
    merchant: receipt.merchant,
    warrantyText: receipt.warranty,
    purchaseType: receipt.purchaseType,
    locale,
    region,
    returnDays: receipt.returnDays,
    itemNames: products.map((line) => line.name),
  }) : null;
  const noDates = hasNoConsumerDates(receipt?.purchaseType);
  const suppressed = receipt && merchantSuggestsOnline(receipt.merchant) && receipt.isOnlinePurchase == null
    ? unknownChannelRetailerNote(locale, receipt.merchant)
    : null;
  const noDatesNote = noDates ? derived?.notes[0] ?? null : null;
  const returnLines: string[] = [];
  const legalLines: string[] = [];
  for (const note of derived?.notes ?? []) {
    if (note === suppressed || note === noDatesNote) continue;
    // A note that is only about the return window stays on Return by.
    // The US sentence that names both warranty and return stays with Warranty.
    const aboutReturn = /return window|prazo de devolu|for returns|aceitar devolu|withdraw|desistir|check your receipt or the store|confira o recibo ou a pol|confirme no recibo ou a pol/i.test(note);
    const aboutWarranty = /warrant|garantia/i.test(note);
    if (aboutReturn && !aboutWarranty) returnLines.push(note);
    else legalLines.push(note);
  }
  if (derived?.disclaimer) legalLines.push(derived.disclaimer);
  const rights = itemRights ?? [];
  const rows = products.map((line, index) => ({ line, index, contracts: contractsFor(line, index, rights) }));
  const matches = highlightMatches(products, notableItems);
  // Highlights choose the reading cards. No highlights keeps every line.
  const coverageRows = notableItems && notableItems.length > 0
    ? matches.flatMap((match) => match.line
      ? [{ line: match.line, index: match.index, contracts: contractsFor(match.line, match.index, rights) }]
      : [])
    : rows;
  const ordered = [...rows].sort((a, b) => Number(hasCoverage(b.contracts)) - Number(hasCoverage(a.contracts)));
  const detailFor = (line: ShownLine, contract: ShownContract) => {
    if (contract.status === "unknown" || contract.status === "not_applicable") return null;
    const detail = provenance(contract);
    return detail ? `${line.name}: ${detail}` : null;
  };
  for (const { line, contracts } of coverageRows) {
    for (const contract of contracts) {
      const detail = detailFor(line, contract);
      if (!detail) continue;
      const bucket = contract.kind === "return" ? returnLines : legalLines;
      if (!bucket.includes(detail)) bucket.push(detail);
    }
  }

  return (
    <div className="space-y-6" data-testid="item-coverage">
      {noDatesNote && (
        <p className="text-sm text-muted-foreground" data-testid="list-rights-notes">{noDatesNote}</p>
      )}

      {notableItems && notableItems.length > 0 && (
        <div data-testid="section-highlights">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{appText("Highlights")}</p>
          <div className="flex gap-3 overflow-x-auto snap-x">
            {matches.map((match, i) => {
              const { item, line, index } = match;
              const contracts = line && index >= 0 ? contractsFor(line, index, rights) : [];
              const tags = [
                ...contracts.filter((c) => c.kind === "return" && c.status !== "unknown" && c.status !== "not_applicable"),
                ...contracts.filter((c) => c.kind === "warranty" && c.status !== "unknown" && c.status !== "not_applicable"),
              ];
              const Icon = categoryIcon(item.category ?? line?.category);
              return (
                <div key={`${item.name}-${i}`} className="shrink-0 w-40 rounded-2xl border border-border p-4 flex flex-col gap-2 snap-start bg-background">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${categoryStyle(item.category ?? line?.category)}`}>
                    <Icon className="w-[1.1rem] h-[1.1rem]" />
                  </span>
                  <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
                  {item.price != null && <p className="font-mono font-bold text-base">{symbol}{item.price.toFixed(2)}</p>}
                  {tags.map((tag) => (
                    <span
                      key={tag.id}
                      className={tag.kind === "return"
                        ? "text-[11px] leading-4 rounded-md bg-neutral-100 text-neutral-800 px-2 py-1"
                        : "text-[11px] leading-4 rounded-md bg-[#121212] text-white px-2 py-1"}
                    >
                      {tag.kind === "return" ? returnTitle(tag, locale) : warrantyLine(tag, locale)}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!noDates && <div data-testid="section-return-by">
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Return by")}</p>
          {returnLines.length > 0 && <WarrantyInfo lines={returnLines} testId="button-return-info" contentTestId="text-return-info" label={appText("About this return")} />}
        </div>
        <div className="space-y-2">
          {coverageRows.map(({ line, contracts }) => {
            const returns = contracts.filter((c) => c.kind === "return" && c.status !== "not_applicable");
            const shown = returns.length > 0 ? returns : contracts.some((c) => c.kind === "return" && c.status === "not_applicable") ? [] : [{
              id: `${line.lineId ?? line.name}-return-unknown`, kind: "return" as const, basis: "rule" as const,
              certainty: "unknown" as const, status: "unknown" as const,
            }];
            return shown.map((contract) => (
              <div key={contract.id} className="rounded-xl border border-border bg-neutral-50 px-4 py-3" data-testid="row-return">
                <p className="text-sm font-semibold">{line.name}</p>
                <p className="text-sm">{returnTitle(contract, locale)}</p>
              </div>
            ));
          })}
        </div>
      </div>}

      {!noDates && <div data-testid="section-warranty">
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Warranty")}</p>
          {legalLines.length > 0 && <WarrantyInfo lines={legalLines} />}
        </div>
        <div className="space-y-2">
          {coverageRows.map(({ line, contracts }) => {
            const warranties = contracts.filter((c) => c.kind === "warranty" && c.status !== "not_applicable" && c.status !== "unknown");
            // A federal "not applicable" rule is not a warranty for this product.
            // Missing stays an unknown card. The receipt text is not copied in.
            const shown = warranties.length > 0 ? warranties : [{
              id: `${line.lineId ?? line.name}-warranty-unknown`, kind: "warranty" as const, basis: "rule" as const,
              certainty: "unknown" as const, status: "unknown" as const,
            }];
            return (
              <div key={line.lineId ?? `${line.name}-${shown[0].id}`} className="rounded-xl bg-[#121212] text-white px-4 py-3" data-testid="row-warranty">
                <p className="text-sm font-semibold">{line.name}</p>
                {shown.map((contract) => (
                  <p key={contract.id} className="text-sm" data-testid="warranty-term">{warrantyLine(contract, locale)}</p>
                ))}
              </div>
            );
          })}
        </div>
      </div>}

      <div data-testid="section-complete-list">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{appText("Complete list")}</p>
          <p className="text-xs text-muted-foreground">{appText("{0} item(s)", [products.reduce((sum, line) => sum + (line.quantity && line.quantity > 1 ? line.quantity : 1), 0)])}</p>
        </div>
        <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
          {ordered.map(({ line, index, contracts }) => (
            <li key={`${line.lineId ?? "line"}-${index}`} className={`flex items-center justify-between gap-3 px-4 py-3 ${hasCoverage(contracts) ? "bg-neutral-50" : "bg-background"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{line.quantity && line.quantity > 1 ? `×${line.quantity} ` : ""}{line.name}</p>
                {hasCoverage(contracts) && (
                  <p className="text-xs text-muted-foreground">
                    {contracts.some((c) => c.kind === "return" && c.status !== "unknown" && c.status !== "not_applicable") ? appText("Return by") : ""}
                    {contracts.some((c) => c.kind === "return" && c.certainty === "estimated") ? ` ${appText("Estimated")}` : ""}
                    {contracts.some((c) => c.kind === "warranty" && c.status !== "unknown" && c.status !== "not_applicable") ? ` · ${appText("Warranty")}` : ""}
                  </p>
                )}
              </div>
              {line.price != null && <span className="font-mono text-sm font-semibold shrink-0">{symbol}{line.price.toFixed(2)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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
  if (contract.lengthMonths && contract.lengthMonths % 12 === 0) return appText("{0} years", [contract.lengthMonths / 12]);
  if (contract.lengthMonths) return appText("{0} months", [contract.lengthMonths]);
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
  const legalLines = (derived?.notes ?? []).filter((note) => note !== suppressed && note !== noDatesNote);
  if (derived?.disclaimer) legalLines.push(derived.disclaimer);
  const rights = itemRights ?? [];
  const rows = products.map((line, index) => ({ line, index, contracts: contractsFor(line, index, rights) }));
  const ordered = [...rows].sort((a, b) => Number(hasCoverage(b.contracts)) - Number(hasCoverage(a.contracts)));

  return (
    <div className="space-y-6" data-testid="item-coverage">
      {noDatesNote && (
        <p className="text-sm text-muted-foreground" data-testid="list-rights-notes">{noDatesNote}</p>
      )}

      {notableItems && notableItems.length > 0 && (
        <div data-testid="section-highlights">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{appText("Highlights")}</p>
          <div className="flex gap-3 overflow-x-auto snap-x">
            {notableItems.map((item, i) => {
              const matches = products.filter((line) => line.name.trim().toLowerCase() === item.name.trim().toLowerCase());
              const line = matches.length === 1 ? matches[0] : null;
              const index = line ? products.indexOf(line) : -1;
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
                      {tag.kind === "return" ? returnTitle(tag, locale) : warrantyTitle(tag, locale)}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!noDates && <div data-testid="section-return-by">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{appText("Return by")}</p>
        <div className="space-y-2">
          {rows.map(({ line, contracts }) => {
            const returns = contracts.filter((c) => c.kind === "return" && c.status !== "not_applicable");
            const shown = returns.length > 0 ? returns : contracts.some((c) => c.kind === "return" && c.status === "not_applicable") ? [] : [{
              id: `${line.lineId ?? line.name}-return-unknown`, kind: "return" as const, basis: "rule" as const,
              certainty: "unknown" as const, status: "unknown" as const,
            }];
            return shown.map((contract) => (
              <div key={contract.id} className="rounded-xl border border-border bg-neutral-50 px-4 py-3" data-testid="row-return">
                <p className="text-sm font-semibold">{line.name}</p>
                <p className="text-sm">{returnTitle(contract, locale)}</p>
                {contract.status !== "unknown" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {contract.certainty === "estimated" ? `${appText("Estimated")} · ` : ""}{provenance(contract)}
                  </p>
                )}
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
          {rows.map(({ line, contracts }) => {
            const warranties = contracts.filter((c) => c.kind === "warranty" && c.status !== "not_applicable");
            const shown = warranties.length > 0 ? warranties : contracts.some((c) => c.kind === "warranty" && c.status === "not_applicable") ? [] : [{
              id: `${line.lineId ?? line.name}-warranty-unknown`, kind: "warranty" as const, basis: "rule" as const,
              certainty: "unknown" as const, status: "unknown" as const,
            }];
            return shown.map((contract) => (
              <div key={contract.id} className="rounded-xl bg-[#121212] text-white px-4 py-3" data-testid="row-warranty">
                <p className="text-sm font-semibold">{line.name}</p>
                <p className="text-sm">{warrantyTitle(contract, locale)}</p>
                {contract.status !== "unknown" && (
                  <p className="text-xs text-white/70 mt-0.5">{provenance(contract)}</p>
                )}
              </div>
            ));
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

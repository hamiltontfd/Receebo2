import { appText, categoryText } from "@/lib/appCopy";
import { CATEGORIES } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type LineCoverageDraft = {
  id?: string;
  kind: "return" | "warranty";
  warrantyType?: "legal" | "manufacturer" | "commercial" | null;
  lengthMonths?: number | null;
  lengthDays?: number | null;
  endDate?: string | null;
  evidence?: string | null;
};

export type LineDraft = {
  lineId?: string | null;
  name: string;
  quantity: number | null;
  price: number | null;
  category: string;
  categoryTouched: boolean;
  coverageTouched: boolean;
  coverages: LineCoverageDraft[];
};

export function lineDraftsFrom(products: ReadonlyArray<{
  lineId?: string | null;
  name: string;
  quantity?: number | null;
  price?: number | null;
  category?: string | null;
  coverages?: LineCoverageDraft[] | null;
}> | null | undefined): LineDraft[] {
  return (products ?? []).map((product) => ({
    lineId: product.lineId,
    name: product.name,
    quantity: product.quantity ?? null,
    price: product.price ?? null,
    category: product.category ?? "",
    categoryTouched: false,
    coverageTouched: false,
    coverages: (product.coverages ?? []).map((coverage) => ({ ...coverage })),
  }));
}

/** Ids always go back. Category and coverages are sent only when this edit changed them. */
export function lineDraftPayload(lines: LineDraft[]) {
  return lines.map((line) => ({
    lineId: line.lineId,
    name: line.name,
    quantity: line.quantity,
    price: line.price,
    ...(line.categoryTouched ? { category: line.category || null } : {}),
    ...(line.coverageTouched ? { coverages: line.coverages } : {}),
  }));
}

export function LineCoverageEditor({ lines, onChange }: { lines: LineDraft[]; onChange: (lines: LineDraft[]) => void }) {
  if (lines.length === 0) return null;
  return (
    <div className="rounded-2xl border divide-y" data-testid="edit-lines">
      {lines.map((line, index) => {
        const maker = line.coverages.find((c) => c.kind === "warranty" && c.warrantyType === "manufacturer");
        const ret = line.coverages.find((c) => c.kind === "return");
        const setLine = (patch: Partial<LineDraft>) => onChange(lines.map((row, i) => i === index ? { ...row, ...patch } : row));
        const setCoverage = (kind: "return" | "warranty", warrantyType: "manufacturer" | null, field: "months" | "days", raw: string) => {
          const next = line.coverages.filter((c) => !(c.kind === kind && (c.warrantyType ?? null) === warrantyType));
          if (raw.trim() !== "" && Number.isFinite(Number(raw))) {
            const previous = line.coverages.find((c) => c.kind === kind && (c.warrantyType ?? null) === warrantyType);
            next.push({
              id: previous?.id,
              kind,
              warrantyType,
              lengthMonths: field === "months" ? Number(raw) : previous?.lengthMonths ?? null,
              lengthDays: field === "days" ? Number(raw) : previous?.lengthDays ?? null,
              endDate: previous?.endDate ?? null,
              evidence: previous?.evidence ?? null,
            });
          }
          setLine({ coverages: next, coverageTouched: true });
        };
        return (
          <div key={`${line.lineId ?? "line"}-${index}`} className="p-4 space-y-2">
            <Input aria-label={appText("Items")} value={line.name} onChange={(e) => setLine({ name: e.target.value })} className="border-0 px-0 h-auto py-0 font-medium shadow-none focus-visible:ring-0" />
            <Select value={line.category || undefined} onValueChange={(value) => setLine({ category: value, categoryTouched: true })}>
              <SelectTrigger aria-label={appText("Category")} className="border-0 px-0 h-auto py-0 shadow-none"><SelectValue placeholder={appText("Category")} /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{categoryText(cat)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-3">
              <label className="text-xs text-muted-foreground flex-1">{appText("Manufacturer warranty")}
                <Input inputMode="numeric" value={maker?.lengthMonths ?? ""} onChange={(e) => setCoverage("warranty", "manufacturer", "months", e.target.value)} className="border-0 px-0 h-auto py-0 shadow-none" />
              </label>
              <label className="text-xs text-muted-foreground flex-1">{appText("Return by")}
                <Input inputMode="numeric" value={ret?.lengthDays ?? ""} onChange={(e) => setCoverage("return", null, "days", e.target.value)} className="border-0 px-0 h-auto py-0 shadow-none" />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

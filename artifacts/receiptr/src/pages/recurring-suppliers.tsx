import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ChevronRight, Repeat } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMailStatus } from "@/components/MailConnections";
import { categoryIcon, categoryStyle } from "@/lib/categories";
import {
  PENDING_QUERY_KEY, RECURRING_QUERY_KEY, fetchRecurringSuppliers, formatMoney, setRecurringSupplierStatus,
  type RecurringSupplier,
} from "@/lib/pendingImports";

export function useRecurringSuppliers(enabled = true) {
  return useQuery<RecurringSupplier[]>({
    queryKey: RECURRING_QUERY_KEY,
    queryFn: fetchRecurringSuppliers,
    staleTime: 60_000,
    retry: false,
    enabled,
  });
}

const KIND_LABEL: Record<RecurringSupplier["kind"], string> = {
  subscription: "Subscription",
  utility: "Utility bill",
};

/** "2026-10-21" or an ISO timestamp → "Oct 21, 2026" (date-only values stay on their calendar day). */
export function formatSupplierDate(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** On first, then the most recent receipt (the server sorts too; kept stable after a switch). */
export function sortSuppliers(list: RecurringSupplier[]): RecurringSupplier[] {
  return [...list].sort((a, b) => {
    const on = Number(b.status === "on") - Number(a.status === "on");
    if (on !== 0) return on;
    return (b.lastReceiptDate ?? "").localeCompare(a.lastReceiptDate ?? "");
  });
}

/** Profile "Email imports" section: shown when a mailbox is connected or a supplier exists. */
export function EmailImportsSection() {
  const { data: mailStatus } = useMailStatus();
  const { data: suppliers } = useRecurringSuppliers();
  const connected = (mailStatus?.providers ?? []).some((p) => p.enabled && p.connected);
  const count = suppliers?.length ?? 0;
  if (!connected && count === 0) return null;
  return (
    <section data-testid="profile-email-imports">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        Email imports
      </h2>
      <div className="border rounded-xl">
        <Link href="/profile/recurring">
          <button
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-secondary/50 transition-colors rounded-xl"
            data-testid="link-recurring-suppliers"
          >
            <span className="font-medium">Recurring suppliers</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {count}
              <ChevronRight className="w-4 h-4" />
            </span>
          </button>
        </Link>
      </div>
    </section>
  );
}

function SupplierRow({ supplier, busy, onToggle }: {
  supplier: RecurringSupplier;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  const Icon = categoryIcon(supplier.category);
  const off = supplier.status === "off";
  const on = supplier.status === "on";
  const last = formatSupplierDate(supplier.lastReceiptDate);
  const amount = formatMoney(supplier.lastAmount, supplier.lastCurrency);
  const receipts = `${supplier.receiptCount} receipt${supplier.receiptCount === 1 ? "" : "s"}`;
  return (
    <div className="px-4 py-3.5 flex items-center gap-3" data-testid={`recurring-row-${supplier.supplierKey}`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${categoryStyle(supplier.category)} ${off ? "opacity-50" : ""}`}>
        <Icon className="w-[1.1rem] h-[1.1rem]" />
      </span>
      <div className={`min-w-0 flex-1 ${off ? "opacity-50" : ""}`}>
        <p className="text-sm font-semibold truncate">{supplier.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {KIND_LABEL[supplier.kind]} · {off ? "Not importing" : receipts}
        </p>
        {(last || amount) && (
          <p className="text-xs text-muted-foreground">
            {last && <>Last {last}</>}
            {last && amount && " · "}
            {amount && <span className="font-mono">{amount}</span>}
          </p>
        )}
      </div>
      <Switch
        checked={on}
        disabled={busy}
        onCheckedChange={onToggle}
        aria-label={`Import ${supplier.displayName} automatically`}
        data-testid={`recurring-switch-${supplier.supplierKey}`}
      />
    </div>
  );
}

/** /profile/recurring: approve a subscription or bill once; the switch is the only way to stop one. */
export default function RecurringSuppliersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useRecurringSuppliers();

  const toggle = useMutation({
    mutationFn: setRecurringSupplierStatus,
    onSuccess: (updated) => {
      queryClient.setQueryData<RecurringSupplier[]>(RECURRING_QUERY_KEY, (old) =>
        old?.map((s) => (s.supplierKey === updated.supplierKey ? { ...s, status: updated.status } : s)));
      // Pending items from it lose (or keep) the recurring card.
      void queryClient.invalidateQueries({ queryKey: PENDING_QUERY_KEY });
      toast(updated.status === "off"
        ? { title: `Stopped importing from ${updated.displayName}`, description: "Turn it back on here anytime." }
        : { title: `${updated.displayName} receipts will now import automatically` });
    },
    onError: () => toast({ title: "Could not update this supplier. Please try again.", variant: "destructive" }),
  });

  const suppliers = sortSuppliers(data ?? []);

  return (
    <div className="max-w-md mx-auto px-6 pt-6 pb-12 w-full">
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Profile
      </Link>
      <h1 className="text-2xl font-bold mt-4">Recurring suppliers</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Approve a subscription or bill once and its receipts import automatically.
      </p>

      {isLoading ? (
        <div className="mt-6 space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="mt-6 rounded-2xl border p-4 flex items-start gap-3 text-sm" data-testid="recurring-empty">
          <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Repeat className="w-4 h-4" />
          </span>
          <p>
            <span className="font-semibold">No recurring suppliers yet.</span>{" "}
            <span className="text-muted-foreground">
              When we spot a subscription or bill in your email, you can approve it once here.
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className="border rounded-xl divide-y mt-6" data-testid="recurring-list">
            {suppliers.map((s) => (
              <SupplierRow
                key={s.supplierKey}
                supplier={s}
                busy={toggle.isPending}
                onToggle={(on) => toggle.mutate({ supplierKey: s.supplierKey, status: on ? "on" : "off" })}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Off stops new receipts from that supplier. Receipts already in your library stay.
          </p>
        </>
      )}
    </div>
  );
}

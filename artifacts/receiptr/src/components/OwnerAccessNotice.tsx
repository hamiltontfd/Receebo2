import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";
export function OwnerAccessNotice({ hasBillingAccount }: { hasBillingAccount: boolean }) {
  useAppLocale();
  return (
    <p className="text-sm text-muted-foreground">
      {appText("Complimentary full access. No subscription or trial expiry.")}
      {hasBillingAccount &&
        appText(" An existing Stripe subscription is not automatically canceled. Any existing charges continue until you cancel it through Manage subscription.")}
    </p>
  );
}

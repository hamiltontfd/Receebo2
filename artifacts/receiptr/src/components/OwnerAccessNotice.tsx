export function OwnerAccessNotice({ hasBillingAccount }: { hasBillingAccount: boolean }) {
  return (
    <p className="text-sm text-muted-foreground">
      Complimentary full access. No subscription or trial expiry.
      {hasBillingAccount &&
        " An existing Stripe subscription is not automatically canceled. Any existing charges continue until you cancel it through Manage subscription."}
    </p>
  );
}

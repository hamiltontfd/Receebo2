# Complimentary owner access

The trusted server configuration in `src/lib/ownerAccess.ts` identifies the
owner email and whether the exemption is enabled. The identity must have that
verified primary email and a matching verified Google external account in Clerk.
No user IDs are copied between Clerk environments, and no public metadata or
request-supplied email grants access.

The entitlement supplies Pro product access, not administrative access. Existing
authorization, legal consent, deletion safeguards, request throttling, and upload
validation remain applicable. There are currently no additional daily product
quotas in the server beyond the subscription gates.

## Activation

Merge and publish the change through the normal release process. No production
credentials, user records, or Stripe subscriptions need to be changed. Sign in
with the configured Google account in the target environment and complete the
legal gate if needed. Settings should show **Owner access** and a complimentary
access notice, with no trial expiry or upgrade requirement.

The development identity was checked read-only: its primary email and matching
Google association are verified. Automated identity, entitlement, route, and UI
tests cover the grant; the owner's interactive Google sign-in and signed-in
Settings screen were not directly verified. Production activation requires
publishing and verifying that separate production identity; this task does not
publish or mutate production.

## Existing Stripe billing

No subscriptions are canceled automatically. If a Stripe customer already exists,
Settings retains **Manage subscription** and warns that existing charges continue
until the subscription is explicitly canceled. The actual subscription reference
is retained for the separate account-deletion cancellation flow.

## Revocation

Set `ownerAccessConfig.enabled` to `false` in the server configuration and release
that change. Server decisions look up current identity/configuration without a
privilege cache; after the new server is running, ordinary subscription rules
apply. A signed-in browser may retain its displayed status until refresh/refetch,
but server-side receipt and attachment creation gates enforce the current status.
Removing or unverifying the matching identity also removes the grant on the next
server check. Identity lookup failures do not grant owner access.

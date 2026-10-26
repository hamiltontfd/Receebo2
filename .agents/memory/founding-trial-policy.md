---
name: Founding customer offer
description: Product scope and the distinction between account trial and paid founding subscriptions.
---
Receebo web offers seven days with no card and three successful receipt uploads total, not a daily allowance. Founding Customer pricing is recurring (€2.99/month or €24.99/year), with eligibility lasting while the account exists, including cancellation and later resubscription. There is no promotion deadline or customer-count limit.

**Why:** The user explicitly specified this offer and prohibited automatic conversion, a perpetual free tier, and changes to existing customers' subscriptions.

**How to apply:** Keep new-account trials separate from legacy Stripe trials. Preserve accurate automatic-charge notices for existing Stripe-trial customers, but never use them for the no-card account trial. Native onboarding is separate scope; shared backend enforcement applies to every client.

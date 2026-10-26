---
name: Stripe sync schema compatibility
description: Stripe sync exposes generated columns and retains newer invoice fields only in raw JSON.
---
Inspect the installed Stripe sync schema before writing queries or integration fixtures.
Some newer invoice fields, including the subscription reference under `parent`,
may exist only in raw JSON while the legacy projected subscription column is null.
Fixtures must insert raw JSON and a synthetic owning account, not generated columns.

**Why:** Sync schema migrations and Stripe API versions evolve independently; a
valid webhook payload does not guarantee that its fields have projected columns.

**How to apply:** Use information_schema for compatibility checks without reading
customer data. Support both current raw-payload and legacy projected references
when recognizing paid invoices. Never assume the SDK's shape matches SQL columns.

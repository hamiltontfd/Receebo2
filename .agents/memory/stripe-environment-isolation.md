---
name: Stripe environment isolation
description: Effective backend credentials may differ from the Stripe connector used by agent tools.
---
Treat the Stripe connector and the application's effective Stripe client as separate credential contexts until verified. A test-mode connector does not imply that the backend is safe for test writes.

**Why:** Inspection found the connector using test mode while the application's explicit key accessed live mode; configured price identifiers resolved with only one credential context.

**How to apply:** Before billing writes or hosted-checkout tests, inspect sanitized mode and price resolution through the effective application client. Verify production separately rather than inferring it from workspace settings. Do not expose keys or automatically change live billing configuration.

Stripe's current hosted portal can schedule cancellation with `cancel_at` while
leaving `cancel_at_period_end` false.

**Why:** A real sandbox portal cancellation used exactly that representation;
checking only the legacy flag incorrectly reported the subscription as continuing.

**How to apply:** Cover both fields when displaying cancellation state or deciding
whether a trial-ending charge reminder should be sent. Preserve access until the
actual scheduled end.

---
name: Automation protection trust boundaries
description: Distinguish managed authentication capabilities from verified tenant settings; preserve unverified proxy limitations.
---

Never infer that Clerk bot protection is enabled from managed-tenant status,
dashboard authorization, an SDK warning, or documentation describing availability.
Report Development and Production as separate observations; unknown stays unknown
when supported tools do not expose the setting.

**Why:** The supported management check confirmed ownership and dashboard access,
but did not expose either tenant's effective antibot configuration. The user
explicitly requires this distinction and forbids unsupported management routes.

**How to apply:** Use only supported, authorized read paths or actual dashboard
observations. Do not install an alternate CLI or probe undocumented remote
configuration endpoints. Missing visibility must not block local action protection.

Retain conservative socket-peer attribution for guest-session creation until
the actual ingress header-rewriting behavior and trusted networks are demonstrated.

**Why:** Shared proxies can group unrelated visitors, but accepting arbitrary
forwarded IP headers merely makes guest-session creation limits bypassable.

**How to apply:** Treat trustworthy client-IP attribution as a separate deployment
verification, not a reason to enable blanket proxy trust while changing action limits.

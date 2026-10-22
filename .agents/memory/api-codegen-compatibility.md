---
name: API generation compatibility
description: Preserve legacy generated-client extensions when regenerating from the API spec.
---

API regeneration can remove working receipt/attachment/pagination behavior because
some earlier features were added directly to generated output without updating
the specification. Do not assume a successful generator invocation preserves the
current API contract.

**Why:** Regeneration for an unrelated billing field removed attachment exports
and infinite-query/pagination support, breaking existing consumers.

**How to apply:** Review generation diffs against existing consumers and preserve
the existing extensions until the specification/generator represents them.
Rebuild shared library declarations before checking dependent applications.

---
name: Onboarding evidence and legacy attribution
description: Why old browser-only onboarding flags cannot be safely assigned to an account.
---

Do not import the old global onboarding search/dismissal flags into the currently
signed-in account. Do not treat legal consent or receipt ownership as evidence
that both onboarding steps were completed.

**Why:** The legacy implementation stored no ownership or server evidence for
search/dismissal. Shared browsers can have multiple accounts, and there is no
reliable way to identify the account that set those flags. The requested account
persistence explicitly excludes blanket completion of old accounts.

**How to apply:** Recover only attributable evidence: owned saved receipts can
confirm the receipt step. Keep new retry journals account-scoped. Do not promise
cross-device recovery of old browser-only state that never reached the server.

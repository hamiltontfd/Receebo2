# Receebo: hackathon log (SpaceXAI Digital Transformation LAB, Braga)

Timeline of work on Receebo using Cursor + Grok Bot, kept for the Taikai submission. One entry per session: goal, what was done (and by whom), files touched, outcome.
Technical details live in `docs/assistant-log.md`.

---

## 26 Oct 2026, session 1: connecting Cursor + Grok Bot to Replit
**Goal:** Keep Receebo hosted on Replit while editing it with Cursor and an AI assistant (Grok Bot).

**What was done**
- Grok Bot generated an SSH key on Hamilton's Mac and configured `~/.ssh/config` (with a `receebo` shortcut).
- Grok Bot signed in to Replit in its own browser (Hamilton logged in) and added the key to the Replit account.
- Grok Bot tested the SSH connection (read + write) and opened the Replit workspace in Cursor via Remote-SSH.
- Diagnosed a Cursor warning (terminal sandbox / AppArmor): harmless, caused by Replit container limits.

**Outcome:** Cursor edits the live Replit workspace directly; Replit remains host and source of truth.

## 26 Oct 2026, session 2: codebase review
**Goal:** Understand what Receebo does and what's left before launch.

**What was done:** Grok Bot did a read-only review of the code and docs over SSH and summarized features, stack, pricing and launch blockers.

**Outcome:** Overview and launch to-do list recorded in `docs/assistant-log.md`.

## 26 Oct 2026, session 3: documentation approach
**Goal:** Keep a record of all work for the hackathon.

**Decision:** Use two files in the repo (`docs/assistant-log.md` technical, `docs/hackathon-log.md` timeline) instead of a Cursor cloud Project, keeping everything on Replit during the ~1-month trial.

**Files touched:** `docs/assistant-log.md` (new), `docs/hackathon-log.md` (new).

## 26 Oct 2026, session 4: critical business review
**Goal:** Honest assessment of whether Receebo works as a B2C subscription at EUR 2.99/month (EUR 24.99/year).

**What was done:** Grok Bot researched competitors (e-Fatura, StuffWatch, ReturnGuard, Clockwork, Slipcrate), PT/EU consumer law, subscription-app benchmarks (RevenueCat 2025), Gmail restricted-scope verification costs, and AI cost per receipt; cross-checked against the code.

**Findings:** Weak as pure B2C subscription: reminder rarely triggers (14-day right applies to online purchases only), 7-day/3-receipt trial ends before value appears, free alternatives exist, thin LTV, yearly Gmail CASA cost. Strengths: accurate PT/EU legal logic (3-year warranty), cheap AI extraction, polished product. Bug: 14-day window counted from purchase date instead of delivery date.

**Recommendations:** Free tier instead of trial; annual/lifetime pricing; email forwarding instead of Gmail OAuth. Pivot options: PT/EU warranty vault, freelancer expense/IRS companion to e-Fatura, B2B2C via banks/insurers/retailers (preferred for the hackathon pitch).

## 26 Oct 2026, session 5: founder problem statement
**Founder insight (Hamilton):** Buys a lot online across several inboxes (Gmail for subscriptions, Outlook for Amazon and e-commerce). When a warranty needs action, the hard part is finding where something was bought and which email was used. Doesn't keep paper receipts. Recently missed an Amazon return window for tools.

**Reframe:** The core problem is retrieving proof of purchase across scattered inboxes and paper, not return reminders. Proposed positioning: every purchase from every inbox in one place, findable in seconds when something breaks; return reminders become a secondary feature.

**Gaps found:** Receebo only imports from Gmail; the founder's own e-commerce mail is in Outlook. Idea: a per-user forwarding address (works with any provider, avoids Google CASA) plus a historical backfill for old warranties.

**Next step:** Validate with 10-15 people at the hackathon: how did you find proof of purchase last time, and have you lost a warranty or return because of it?

## 26 Oct 2026, session 6: which email sources to support
**Question:** Beyond Gmail, which providers make Receebo the single source of truth for receipts?

**Recommendation (Grok Bot):** (1) Outlook/Hotmail/Live via Microsoft Graph read-only mail (second-largest provider; covers the founder's own e-commerce inbox; no Google-style yearly paid assessment as far as known, publisher verification recommended). (2) Per-user forwarding address (e.g. you@in.receebo.net) as the universal channel for iCloud, Yahoo, SAPO, GMX, work mail. (3) Skip direct iCloud/Yahoo/regional integrations for now (iCloud = IMAP + app-specific passwords; Yahoo mail access needs approval). Also consider Amazon order-history file import.

**Decision pending:** Build Outlook + forwarding address next; lead the pitch with the forwarding address.

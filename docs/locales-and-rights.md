# Locales and consumer rights by country (Brazil, US)

Status: scaffolding, not published. Everything marked [LEGAL REVIEW NEEDED]
needs a lawyer before it ships. Sources: `/workspace/receebo/consumer-rules-br-us.md`,
`/workspace/receebo-site-ptBR.md`, email spec §2.

## Locales (`artifacts/receiptr/src/lib/locale.ts`)
- `en`, `pt-PT`, `pt-BR`. Fallback: pt-BR → pt-BR, other pt → pt-PT, else en.
- The app UI is still English. `getAppLocale()` returns `en` unless
  `localStorage["receebo:locale"]` is set (test hook until there is a saved
  user locale). Today only the consumer-rights panel strings are translated
  (`rightsCopy.ts`).
- Dates/money follow the email spec table (en "Dec 12, 2026" / "€449.00";
  pt-PT "12 dez 2026" / "449,00 €"; pt-BR "12 de dez. de 2026" / "€ 449,00").

## Consumer-rights panel (`consumerRights.ts`)
- **Brazil (CDC, Lei 8.078/1990)** [LEGAL REVIEW NEEDED]
  - Legal guarantee (art. 26): 90 days (durable) / 30 days (non-durable) to report
    apparent defects, counted from delivery when known, else purchase. Shown as a
    complaint deadline, not a warranty period.
  - Manufacturer warranty: read from the receipt's warranty text, its own end date
    (purchase date + stated months). **Shown side by side; the two are never added
    together** (Hamilton's decision; the research notes some Procons read art. 50
    "complementar" as additive: lawyer question).
  - Notes: hidden defects (art. 26 §3), 30 days to fix then choice (art. 18 §1),
    7-day withdrawal from delivery for online purchases (art. 49).
- **US**: structure only. No legal warranty; retailer return days labelled
  "typical, check with the store"; note that there is no federal minimum.
- **PT/EU** unchanged (3-year / 2-year legal warranty), plus the manufacturer
  warranty card when the receipt states one.
- Return windows count from delivery when known (session 16, item 5).

## Legal documents (`legalDocuments.ts`)
One document per market and language, chosen by account country:
PT (live, English), BR (pt-BR, placeholder), US (en-US, placeholder).
BR/US users still see the current documents until the drafts are reviewed.

## Not done yet
- Saved user locale (DB column + settings switch) and translating the rest of the app.
- pt-BR / en-US terms and privacy pages in the app.
- Server emails per locale; return-window reminders still use the unsourced US retailer table.
- Per-receipt "country of purchase" selector; BR durable/non-durable classification beyond category.

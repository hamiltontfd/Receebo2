# Item return and warranty coverage

Per-line coverage is stored on the product itself. The receipt-level `warranty` string, `returnDays`, and the reminder columns stay as they are. Nothing in this design copies those receipt facts onto lines.

## Identity

Each new or edited line gets a `lineId` (`l_` plus 16 hex characters). Extraction ignores any id the model sends and assigns its own. A later edit keeps that id across reordering and renames.

Lines saved before this change have no `lineId`. They are not matched by name. A read evaluates them in place (`lineId: null`) and does not invent a period. The first save that sends lines without ids replaces those legacy lines and assigns ids, still with no coverage. If stored lines already have ids, a save that omits every id is rejected, so an old client cannot wipe them.

## What is stored

`products[]` is the same encrypted JSON as before. Optional fields:

- `lineId`, `category`, `categorySource` (`user` or `extraction`)
- `coverages[]`: a period the document stated for that line, or the user entered for that line

A stored coverage is `return` or `warranty`. A warranty is `legal`, `manufacturer`, or `commercial`. The length or an explicit end date is stored. A length is not converted into an end date until read, so a later change of the purchase date recomputes it. `basis: "rule"` is never stored.

A stored length is not turned into a calendar date unless the purchase date is known. With no start, the length stays and the deadline stays unknown. A legal period is never stored from a quote or a save. It only appears as a computed rule.

The line category is whatever was set on that line. The receipt's category is not copied down. Pending email imports keep the same product object, including `lineId` and coverages, in their extraction JSON. That is why the import type lists those fields. The tokens and mailbox columns are unchanged. An empty or unknown category stays empty. It is not turned into `Other`.

## What extraction may attach

A model coverage is an estimate, never a confirmed fact. It is kept only when all of these hold:

- `evidence` is a short quote (at most 240 characters) that appears in `ocrText`
- the quote is not the receipt-level `warranty` string
- the quote names this line and does not name another line on the same receipt. A quote that only sits somewhere in the OCR, or that could belong to more than one line, is dropped and the line stays unknown
- it is manufacturer or commercial, never a legal warranty (the server applies the law)
- the same coverage was not pasted onto more than one line

Anything else, including prompt text (`ignore previous instructions`, a script tag), is dropped. The line itself is kept, with no coverage. OCR text alone does not create a period.

Duplicate photo lines still collapse when their coverages are equal or absent. Two lines with the same name and price but different stated coverages are both kept.

## What is computed on read

`itemRights` is returned by GET and by PATCH. It is not saved. For each line the server evaluates the rules that already exist:

- Account region `US`: the sourced US store table, one line at a time (a TV and a fridge can differ). No federal legal warranty (`not_applicable`, not a guessed date). The receipt-level `returnDays` number is not applied to lines.
- Any other account region: the purchase country, with the same delivery-then-domain-then-seller precedence already stored in `purchaseCountry`. Portugal and the EU keep their statutory warranty and online withdrawal. Brazil keeps the CDC art. 26 complaint deadline (still marked for legal review) and the 7-day online withdrawal. A country with no rule stays unknown. No date is invented.
- In-store, outside the US, the statutory withdrawal does not run. The return stays unknown unless that line has its own stated period.
- A missing delivery date still starts a statutory period on the purchase date, and the result stays `estimated`. An estimated period that has passed stays `expired` and `estimated`.
- A user-set category with a delivery date can be `confirmed`. A category that came from extraction stays `estimated`.
- A subscription, digital purchase, ticket, or service is `not_applicable` for the statutory dates. A period the user stored on the line is still returned beside that.
- Two stated periods of the same kind that disagree are both kept, with `conflict: true`. A stated period beside a statutory one is two contracts, not a conflict, and neither is deleted.
- No rule and no stated period is `unknown`, with no end date. Unknown is not "no coverage".

## Editing

PATCH `products` is the full ordered list.

- Omit `products` and the stored lines are untouched. Current edit, import, and save flows do this.
- Omit `coverages` on a line and that line's stated coverages stay.
- Send `coverages` (including `[]`) to replace them. The server stores them as the user's, even if the body claims `basis: "rule"` or `source: "extraction"`.
- A repeated or malformed `lineId` is a 400. Nothing is written.

## Reminders

Unchanged. `computeWarrantyExpiries` still reads only the receipt-level columns (`warranty`, country, category, dates, purchase type). Item coverage is not an input, does not re-arm a reminder, and does not cancel one. Unknown lines do not create a schedule.

Proposed later behavior, not implemented: an item reminder would need its own sent-for key per receipt, line id, coverage id, and end date. It must not reuse `legal_warranty_expires_on`, `manufacturer_warranty_expires_on`, or the return reminder timestamps. Until that decision, do not send item reminders and do not backfill those columns from lines.

## Migration

No new column and no startup migration. Existing rows stay valid. Deploying the code does not `UPDATE` old receipts and does not re-extract them.

Do not run a backfill. New extractions and an explicit line edit are the only writers. A database that already has receipts needs nothing applied before those writes.

## Not in this change

The approved reading layout (highlight tags, separate Return by and Warranty cards, the overflow delete) is not built. The Walmart picture is not a policy and its 2-year and 5-year figures are not hardcoded.

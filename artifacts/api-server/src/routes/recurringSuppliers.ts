/**
 * Recurring suppliers ("approve once"), see lib/recurringSuppliers.ts.
 *
 *   GET  /mail/recurring-suppliers                     Profile list
 *   PUT  /mail/recurring-suppliers/:key  { status: "on" | "off" }
 *        Profile switch: future imports only (pending items are not touched).
 *        Off is the only way to stop a supplier.
 *   POST /mail/recurring-suppliers/:key/always-import  { id?, category? }
 *        on + accept this and every pending import from the supplier, in one
 *        transaction, up to the no-card trial's remaining slots.
 */
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, pendingImportsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { tryLockUserDataMutation } from "../lib/userDataLock";
import { gmailLogger as logger } from "../lib/logger";
import { TRIAL_CAP_ERROR } from "../lib/accountTrial";
import { normalizeCategory } from "../lib/categories";
import { rankPendingImports } from "../lib/pendingImportRanking";
import { approvePendingBatch, checkApproveAccess } from "../lib/pendingApproval";
import {
  loadSupplierOverview, saveSupplierDecision, sortSupplierViews, SUPPLIER_DECISIONS,
  type SupplierDecision, type SupplierView,
} from "../lib/recurringSuppliers";

const router = Router();
const BASE = "/mail/recurring-suppliers";
const KEY_PATTERN = /^[a-z0-9][a-z0-9.+-]{0,99}$/;

function publicView(view: SupplierView) {
  const { pendingIds: _ids, ...rest } = view;
  return rest;
}

async function findSupplier(userId: string, key: unknown): Promise<SupplierView | null> {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) return null;
  return (await loadSupplierOverview(userId)).get(key) ?? null;
}

async function supplierPendingRows(userId: string, ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(pendingImportsTable).where(and(
    eq(pendingImportsTable.userId, userId), eq(pendingImportsTable.status, "pending"), inArray(pendingImportsTable.id, ids)));
}

router.get(BASE, requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  try {
    const views = sortSupplierViews((await loadSupplierOverview(req.userId!)).values());
    res.json({ suppliers: views.map(publicView) });
  } catch (err) {
    logger.error({ err }, "GET /mail/recurring-suppliers failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.put(`${BASE}/:key`, requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  const status = (req.body as { status?: unknown } | null)?.status;
  if (!SUPPLIER_DECISIONS.includes(status as SupplierDecision)) {
    res.status(400).json({ error: "status must be on or off" });
    return;
  }
  try {
    const view = await findSupplier(req.userId!, req.params.key);
    if (!view) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }
    // Future imports only: pending items stay as they are.
    const pending = await supplierPendingRows(req.userId!, view.pendingIds);
    await saveSupplierDecision(req.userId!, view, status as SupplierDecision, {
      senderDomains: pending.map((p) => p.extractionData?.senderDomain),
    });
    res.json({ supplier: publicView({ ...view, status: status as SupplierDecision }) });
  } catch (err) {
    logger.error({ err }, "PUT /mail/recurring-suppliers/:key failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post(
  `${BASE}/:key/always-import`,
  requireAuth,
  requireCurrentLegalAcceptance,
  tryLockUserDataMutation(async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as { id?: unknown; category?: unknown };
    const firstId = body.id === undefined || body.id === null ? null : Number(body.id);
    if (firstId !== null && !(Number.isSafeInteger(firstId) && firstId > 0)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    let category: string | undefined;
    if (body.category !== undefined && body.category !== null) {
      const raw = typeof body.category === "string" ? body.category.trim() : "";
      const normalized = raw ? normalizeCategory(raw) : "";
      if (!raw || normalized.toLowerCase() !== raw.toLowerCase()) {
        res.status(400).json({ error: "Invalid category" });
        return;
      }
      category = normalized;
    }
    try {
      const view = await findSupplier(req.userId!, req.params.key);
      if (!view) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }
      if (firstId !== null && !view.pendingIds.includes(firstId)) {
        res.status(404).json({ error: "Pending import not found for this supplier" });
        return;
      }
      const access = await checkApproveAccess(req.userId!);
      if (!access.ok) {
        res.status(access.status).json(access.body);
        return;
      }
      const pending = await supplierPendingRows(req.userId!, view.pendingIds);
      // This one first, then the rest in ranking order (same as bulk accept).
      const ranked = rankPendingImports(pending.filter((p) => p.id !== firstId));
      const first = pending.filter((p) => p.id === firstId);
      const ordered = [...first, ...ranked];
      // A category chosen in the sheet: for this receipt and as the supplier's default.
      const row = await saveSupplierDecision(req.userId!, view, "on", {
        ...(category ? { category } : {}),
        senderDomains: pending.map((p) => p.extractionData?.senderDomain),
      });
      const supplierCategory = row.category ?? undefined;
      const { approved, skipped } = await approvePendingBatch(req.userId!, ordered, access.trial,
        (id) => (id === firstId && category) ? category : supplierCategory);
      logger.info({ userId: req.userId, supplier: view.supplierKey, approved: approved.length, skipped: skipped.length },
        "Recurring supplier set to always import");
      res.json({
        supplier: publicView({ ...view, status: "on", ...(row.category ? { category: row.category } : {}) }),
        approved,
        skipped,
        ...(skipped.length > 0 ? { code: "TRIAL_UPLOAD_LIMIT", message: TRIAL_CAP_ERROR.message } : {}),
      });
    } catch (err) {
      logger.error({ err }, "POST /mail/recurring-suppliers/:key/always-import failed");
      res.status(500).json({ error: "Failed to import from this supplier" });
    }
  }),
);

export default router;

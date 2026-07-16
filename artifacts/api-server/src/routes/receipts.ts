import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db, receiptsTable, receiptAttachmentsTable } from "@workspace/db";
import {
  CreateReceiptBody,
  ListReceiptsResponse,
  GetReceiptStatsResponse,
  GetRecentReceiptsQueryParams,
  GetRecentReceiptsResponse,
  GetMerchantBreakdownResponse,
  GetReceiptParams,
  GetReceiptResponse,
  UpdateReceiptParams,
  UpdateReceiptBody,
  UpdateReceiptResponse,
  DeleteReceiptParams,
  CheckSimilarReceiptQueryParams,
  CheckSimilarReceiptResponseItem,
} from "@workspace/api-zod";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { enqueueExtraction } from "../lib/extractionQueue";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

const CANONICAL_CATEGORIES = ["Electronics", "Home", "Clothing & Apparel", "Groceries", "Other"] as const;
function normalizeCategory(value: string | null | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value && (CANONICAL_CATEGORIES as readonly string[]).includes(value)) return value;
  return "Other";
}

const router: IRouter = Router();

router.get("/receipts", requireAuthOrGuest, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const conditions = [
    eq(receiptsTable.userId, req.userId!),
    eq(receiptsTable.isDraft, false),
  ];
  if (q.length > 0) {
    const term = `%${q}%`;
    const search = or(
      ilike(receiptsTable.merchant, term),
      ilike(receiptsTable.category, term),
      ilike(receiptsTable.summary, term),
      ilike(receiptsTable.ocrText, term),
      ilike(receiptsTable.originalFileName, term),
      ilike(receiptsTable.currency, term),
      sql`${receiptsTable.products}::text ILIKE ${term}`,
    );
    if (search) conditions.push(search);
  }

  const rows = await db
    .select()
    .from(receiptsTable)
    .where(and(...conditions))
    .orderBy(desc(receiptsTable.createdAt));

  res.json(ListReceiptsResponse.parse(rows));
});

const DAILY_UPLOAD_LIMIT = 5;

function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

router.get("/receipts/daily-count", requireAuthOrGuest, async (req, res): Promise<void> => {
  const midnight = todayMidnightUTC();
  const userId = req.userId!;

  const [receiptRow] = await db
    .select({ used: count() })
    .from(receiptsTable)
    .where(and(eq(receiptsTable.userId, userId), gte(receiptsTable.createdAt, midnight)));

  const [attRow] = await db
    .select({ used: count() })
    .from(receiptAttachmentsTable)
    .innerJoin(receiptsTable, eq(receiptAttachmentsTable.receiptId, receiptsTable.id))
    .where(and(eq(receiptsTable.userId, userId), gte(receiptAttachmentsTable.createdAt, midnight)));

  const used = Number(receiptRow?.used ?? 0) + Number(attRow?.used ?? 0);
  res.json({ used, remaining: Math.max(0, DAILY_UPLOAD_LIMIT - used), limit: DAILY_UPLOAD_LIMIT });
});

router.post("/receipts", requireAuthOrGuest, async (req, res): Promise<void> => {
  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.userId!;
  const midnight = todayMidnightUTC();

  // Atomically check the daily cap and insert within a single transaction.
  // pg_advisory_xact_lock serialises concurrent uploads for the same user so
  // two simultaneous requests cannot both observe used < 5 and both insert.
  // The lock key is derived from the user ID string via hashtext() and is
  // automatically released when the transaction commits or rolls back.
  let receipt: (typeof receiptsTable.$inferSelect) | undefined;
  let limitReached = false;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [countRow] = await tx
      .select({ used: count() })
      .from(receiptsTable)
      .where(and(eq(receiptsTable.userId, userId), gte(receiptsTable.createdAt, midnight)));

    const [attCountRow] = await tx
      .select({ used: count() })
      .from(receiptAttachmentsTable)
      .innerJoin(receiptsTable, eq(receiptAttachmentsTable.receiptId, receiptsTable.id))
      .where(and(eq(receiptsTable.userId, userId), gte(receiptAttachmentsTable.createdAt, midnight)));

    const totalToday = Number(countRow?.used ?? 0) + Number(attCountRow?.used ?? 0);

    if (totalToday >= DAILY_UPLOAD_LIMIT) {
      limitReached = true;
      return;
    }

    const [inserted] = await tx
      .insert(receiptsTable)
      .values({
        userId,
        objectPath: parsed.data.objectPath,
        originalFileName: parsed.data.originalFileName,
        contentType: parsed.data.contentType,
        status: "processing",
        isDraft: true,
        products: [],
      })
      .returning();

    receipt = inserted;
  });

  if (limitReached) {
    res.status(429).json({
      error: "daily_limit_reached",
      message: "You've reached your 5 receipt limit for today. Come back tomorrow.",
    });
    return;
  }

  enqueueExtraction({
    receiptId: receipt!.id,
    objectPath: receipt!.objectPath,
    contentType: receipt!.contentType,
  });

  res.status(201).json(GetReceiptResponse.parse(receipt!));
});

router.get("/receipts/stats", requireAuthOrGuest, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(receiptsTable)
    .where(
      and(
        eq(receiptsTable.userId, req.userId!),
        eq(receiptsTable.isDraft, false),
      ),
    );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalSpend = 0;
  let thisMonthSpend = 0;
  const merchants = new Set<string>();
  const categoryTotals = new Map<string, number>();

  for (const r of rows) {
    const amount = r.total ?? 0;
    totalSpend += amount;
    if (r.createdAt && new Date(r.createdAt) >= monthStart) {
      thisMonthSpend += amount;
    }
    if (r.merchant) merchants.add(r.merchant.toLowerCase());
    if (r.category) {
      categoryTotals.set(
        r.category,
        (categoryTotals.get(r.category) ?? 0) + amount,
      );
    }
  }

  let topCategory: string | null = null;
  let topCategoryTotal = -1;
  for (const [cat, total] of categoryTotals) {
    if (total > topCategoryTotal) {
      topCategoryTotal = total;
      topCategory = cat;
    }
  }

  res.json(
    GetReceiptStatsResponse.parse({
      totalReceipts: rows.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      merchantCount: merchants.size,
      thisMonthSpend: Math.round(thisMonthSpend * 100) / 100,
      topCategory,
    }),
  );
});

router.get("/receipts/recent", requireAuthOrGuest, async (req, res): Promise<void> => {
  const parsed = GetRecentReceiptsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const limit = parsed.data.limit ?? 5;

  const rows = await db
    .select()
    .from(receiptsTable)
    .where(
      and(
        eq(receiptsTable.userId, req.userId!),
        eq(receiptsTable.isDraft, false),
      ),
    )
    .orderBy(desc(receiptsTable.createdAt))
    .limit(limit);

  res.json(GetRecentReceiptsResponse.parse(rows));
});

router.get(
  "/receipts/merchant-breakdown",
  requireAuthOrGuest,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.userId, req.userId!),
          eq(receiptsTable.isDraft, false),
        ),
      );

    const map = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const merchant = r.merchant ?? "Unknown";
      const entry = map.get(merchant) ?? { total: 0, count: 0 };
      entry.total += r.total ?? 0;
      entry.count += 1;
      map.set(merchant, entry);
    }

    const breakdown = Array.from(map.entries())
      .map(([merchant, { total, count }]) => ({
        merchant,
        total: Math.round(total * 100) / 100,
        count,
      }))
      .sort((a, b) => b.total - a.total);

    res.json(GetMerchantBreakdownResponse.parse(breakdown));
  },
);

router.get("/receipts/check-similar", requireAuthOrGuest, async (req, res): Promise<void> => {
  const parsed = CheckSimilarReceiptQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { merchant, purchaseDate, total } = parsed.data;

  // All three fields must be present for a meaningful exact-match duplicate check.
  // If any is missing, there is nothing useful to match against.
  if (merchant == null || purchaseDate == null || total == null) {
    res.json([]);
    return;
  }

  const rows = await db
    .select({
      id: receiptsTable.id,
      merchant: receiptsTable.merchant,
      purchaseDate: receiptsTable.purchaseDate,
      total: receiptsTable.total,
    })
    .from(receiptsTable)
    .where(
      and(
        eq(receiptsTable.userId, req.userId!),
        eq(receiptsTable.isDraft, false),
        eq(receiptsTable.status, "completed"),
        eq(receiptsTable.merchant, merchant),
        eq(receiptsTable.purchaseDate, purchaseDate),
        eq(receiptsTable.total, total),
      ),
    );

  res.json(rows.map((r) => CheckSimilarReceiptResponseItem.parse(r)));
});

router.get("/receipts/:id", requireAuthOrGuest, async (req, res): Promise<void> => {
  const params = GetReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [receipt] = await db
    .select()
    .from(receiptsTable)
    .where(
      and(
        eq(receiptsTable.id, params.data.id),
        eq(receiptsTable.userId, req.userId!),
      ),
    );

  if (!receipt) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  const attachments = await db
    .select()
    .from(receiptAttachmentsTable)
    .where(eq(receiptAttachmentsTable.receiptId, receipt.id));

  res.json(GetReceiptResponse.parse({ ...receipt, attachments }));
});

router.patch("/receipts/:id", requireAuthOrGuest, async (req, res): Promise<void> => {
  const params = UpdateReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [receipt] = await db
    .update(receiptsTable)
    .set({
      ...parsed.data,
      ...(parsed.data.category !== undefined
        ? { category: normalizeCategory(parsed.data.category) }
        : {}),
    })
    .where(
      and(
        eq(receiptsTable.id, params.data.id),
        eq(receiptsTable.userId, req.userId!),
      ),
    )
    .returning();

  if (!receipt) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  res.json(UpdateReceiptResponse.parse(receipt));
});

router.delete("/receipts/:id", requireAuthOrGuest, async (req, res): Promise<void> => {
  const params = DeleteReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(receiptsTable)
    .where(
      and(
        eq(receiptsTable.id, params.data.id),
        eq(receiptsTable.userId, req.userId!),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  // Delete all attachment storage objects first (DB rows cascade via FK)
  const attachments = await db
    .select({ objectPath: receiptAttachmentsTable.objectPath, id: receiptAttachmentsTable.id })
    .from(receiptAttachmentsTable)
    .where(eq(receiptAttachmentsTable.receiptId, existing.id));

  for (const att of attachments) {
    try {
      await objectStorageService.deleteObject(att.objectPath);
    } catch (err) {
      logger.warn(
        { err, attachmentId: att.id, objectPath: att.objectPath },
        "Failed to delete attachment storage object; proceeding",
      );
    }
  }

  try {
    await objectStorageService.deleteObject(existing.objectPath);
  } catch (err) {
    logger.warn(
      { err, receiptId: existing.id, objectPath: existing.objectPath },
      "Failed to delete storage object for receipt; proceeding with DB delete",
    );
  }

  await db
    .delete(receiptsTable)
    .where(eq(receiptsTable.id, existing.id));

  res.sendStatus(204);
});

export default router;

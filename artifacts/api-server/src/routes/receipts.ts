import { Router, type IRouter } from "express";
import { and, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm";
import { db, receiptsTable, receiptAttachmentsTable, uploadIntentsTable } from "@workspace/db";
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
import { getSubscriptionStatus } from "../lib/subscriptionStatus";
import { lockUserDataMutation } from "../lib/userDataLock";

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
  const isSearch = q.length > 0;

  // Pagination params — only applied when not searching
  const limitRaw = parseInt(req.query.limit as string, 10);
  const limit = isNaN(limitRaw) ? 20 : Math.min(Math.max(1, limitRaw), 50);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

  const conditions = [
    eq(receiptsTable.userId, req.userId!),
    eq(receiptsTable.isDraft, false),
  ];

  if (isSearch) {
    const term = `%${q}%`;
    const search = or(
      ilike(receiptsTable.merchant, term),
      ilike(receiptsTable.category, term),
      ilike(receiptsTable.summary, term),
      ilike(receiptsTable.ocrText, term),
      ilike(receiptsTable.originalFileName, term),
      ilike(receiptsTable.currency, term),
      sql`${receiptsTable.products}::text ILIKE ${term}`,
      sql`${receiptsTable.notableItems}::text ILIKE ${term}`,
    );
    if (search) conditions.push(search);
  } else if (cursor) {
    // Cursor pagination: fetch items older than the cursor timestamp
    try {
      conditions.push(lt(receiptsTable.createdAt, new Date(cursor)));
    } catch {
      // Invalid cursor — ignore, return from the top
    }
  }

  // For search: fetch all matches. For paginated: fetch limit+1 to detect next page.
  const fetchLimit = isSearch ? 10000 : limit + 1;

  const rows = await db
    .select()
    .from(receiptsTable)
    .where(and(...conditions))
    .orderBy(desc(receiptsTable.createdAt))
    .limit(fetchLimit);

  if (isSearch) {
    res.json({ items: ListReceiptsResponse.parse(rows), nextCursor: null });
  } else {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? (items[items.length - 1].createdAt as Date).toISOString()
      : null;
    res.json({ items: ListReceiptsResponse.parse(items), nextCursor });
  }
});

router.post("/receipts", requireAuthOrGuest, lockUserDataMutation(async (req, res): Promise<void> => {
  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.userId!;

  // Free users (no active subscription) cannot upload receipts at all
  const subscription = await getSubscriptionStatus(userId);
  if (subscription.plan === "free") {
    res.status(403).json({
      error: "subscription_required",
      message: "An active subscription is required to upload receipts.",
    });
    return;
  }

  // Atomically verify the upload intent and insert within a single transaction.
  // The route-level per-user lock serialises this mutation with account deletion.
  let receipt: (typeof receiptsTable.$inferSelect) | undefined;
  let intentMissing = false;

  await db.transaction(async (tx) => {
    // Verify the objectPath was issued by this server to this user.
    // Atomically consume the intent so it cannot be reused.
    const [intent] = await tx
      .delete(uploadIntentsTable)
      .where(
        and(
          eq(uploadIntentsTable.userId, userId),
          eq(uploadIntentsTable.objectPath, parsed.data.objectPath),
          gt(uploadIntentsTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: uploadIntentsTable.id });

    if (!intent) {
      intentMissing = true;
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

  if (intentMissing) {
    res.status(403).json({ error: "Invalid or expired upload path" });
    return;
  }

  enqueueExtraction({
    userId,
    receiptId: receipt!.id,
    objectPath: receipt!.objectPath,
    contentType: receipt!.contentType,
  });

  res.status(201).json(GetReceiptResponse.parse(receipt!));
}));

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

router.patch("/receipts/:id", requireAuthOrGuest, lockUserDataMutation(async (req, res): Promise<void> => {
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
}));

router.delete("/receipts/:id", requireAuthOrGuest, lockUserDataMutation(async (req, res): Promise<void> => {
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
}));

export default router;

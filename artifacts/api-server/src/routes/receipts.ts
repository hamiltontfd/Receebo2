import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, receiptsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { enqueueExtraction } from "../lib/extractionQueue";

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

router.post("/receipts", requireAuthOrGuest, async (req, res): Promise<void> => {
  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [receipt] = await db
    .insert(receiptsTable)
    .values({
      userId: req.userId!,
      objectPath: parsed.data.objectPath,
      originalFileName: parsed.data.originalFileName,
      contentType: parsed.data.contentType,
      status: "processing",
      isDraft: true,
      products: [],
    })
    .returning();

  enqueueExtraction({
    receiptId: receipt.id,
    objectPath: receipt.objectPath,
    contentType: receipt.contentType,
  });

  res.status(201).json(GetReceiptResponse.parse(receipt));
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

  res.json(GetReceiptResponse.parse(receipt));
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

  const [receipt] = await db
    .delete(receiptsTable)
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

  res.sendStatus(204);
});

export default router;

// Illustrative en-US collection for the loopback harness only.
// Merchants are fictional and are not in the US store table.
// Stated periods are sample text, not a US legal minimum and not a retailer policy.
const base = {
  status: "completed", currency: "USD", purchaseCountry: "US",
  isOnlinePurchase: false, deliveryDate: null, isDraft: false, contentType: "application/pdf",
  objectPath: "/objects/sample-receipt.pdf", originalFileName: "northwind-sample.pdf",
  attachments: [], transactionNumber: null,
};
const at = date => ({ createdAt: `${date}T16:00:00Z`, updatedAt: `${date}T16:00:00Z` });
const stated = (id, kind, warrantyType, lengthDays, lengthMonths, evidence) => ({
  id, kind, warrantyType, basis: "stated", certainty: "estimated",
  lengthDays, lengthMonths, endDate: null, evidence, source: "extraction",
});

const displayWarranty = "Illustrative sample: 55-inch display, 24-month manufacturer warranty. Not a store policy.";
const displayReturn = "Illustrative sample: 55-inch display, 30-day return. Not a US legal minimum.";
const speakerWarranty = "Illustrative sample: shelf speaker, 18-month manufacturer warranty. Not a store policy.";
const speakerReturn = "Illustrative sample: shelf speaker, 45-day return. Not a US legal minimum.";
const lampWarranty = "Illustrative sample: floor lamp, 12-month manufacturer warranty. Not a store policy.";

export const usCapturedAt = "2026-11-08T16:00:00Z";
export const usSearchQuery = "display";
export const usReceipts = [
  {
    ...base, ...at("2026-11-02"), id: 911, merchant: "Northwind Supply", category: "Electronics",
    purchaseDate: "2026-11-02", total: 486,
    ocrText: ["FICTIONAL SAMPLE RECEIPT", displayWarranty, displayReturn, speakerWarranty, speakerReturn].join("\n"),
    products: [
      {
        lineId: "l_usnwdisplay01", name: "55-inch display", price: 360, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [
          stated("c_usnwdispw01", "warranty", "manufacturer", null, 24, displayWarranty),
          stated("c_usnwdispr01", "return", null, 30, null, displayReturn),
        ],
      },
      {
        lineId: "l_usnwspeaker01", name: "Shelf speaker", price: 90, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [
          stated("c_usnwsprkw01", "warranty", "manufacturer", null, 18, speakerWarranty),
          stated("c_usnwsprkr01", "return", null, 45, null, speakerReturn),
        ],
      },
      { lineId: "l_usnwcable0001", name: "Signal cable", price: 18, quantity: 1 },
      { lineId: "l_usnwanchor001", name: "Wall anchors", price: 8, quantity: 1 },
      { lineId: "l_usnwcloth0001", name: "Cleaning cloth", price: 10, quantity: 1 },
    ],
    notableItems: [
      { name: "55-inch display", price: 360, category: "Electronics", reason: "Illustrative sample highlight. Not a store policy." },
      { name: "Shelf speaker", price: 90, category: "Electronics", reason: "Illustrative sample highlight. Not a store policy." },
    ],
    summary: "Illustrative in-store sample at fictional Northwind Supply. Two electronics lines have different stated manufacturer terms and different stated return periods. Three small items have no stated coverage.",
    warranty: "Illustrative sample. Line text is not copied onto other items and is not a store policy.",
  },
  {
    ...base, ...at("2026-10-28"), id: 912, merchant: "Harbor and Pine", category: "Home",
    purchaseDate: "2026-10-28", total: 140, originalFileName: "harbor-sample.pdf",
    ocrText: `FICTIONAL SAMPLE RECEIPT\n${lampWarranty}`,
    products: [{
      lineId: "l_usharbor0001", name: "Floor lamp", price: 140, quantity: 1,
      category: "Home", categorySource: "extraction",
      coverages: [stated("c_usharborw01", "warranty", "manufacturer", null, 12, lampWarranty)],
    }],
    notableItems: [{ name: "Floor lamp", price: 140, category: "Home", reason: "Illustrative sample highlight. Not a store policy." }],
    summary: "Illustrative sample. One stated manufacturer term. No stated return period.",
    warranty: "Illustrative sample. Not a store policy.",
  },
  {
    ...base, ...at("2026-11-05"), id: 913, merchant: "Linden Market", category: "Groceries",
    purchaseDate: "2026-11-05", total: 27.4, originalFileName: "linden-sample.pdf",
    ocrText: "FICTIONAL SAMPLE RECEIPT",
    products: [
      { lineId: "l_uslinden0001", name: "Rolled oats", price: 4.5, quantity: 1 },
      { lineId: "l_uslinden0002", name: "Apples", price: 3.2, quantity: 1 },
      { lineId: "l_uslinden0003", name: "Bread loaf", price: 2.4, quantity: 1 },
      { lineId: "l_uslinden0004", name: "Milk", price: 3.8, quantity: 1 },
      { lineId: "l_uslinden0005", name: "Black tea", price: 6.1, quantity: 1 },
      { lineId: "l_uslinden0006", name: "Honey jar", price: 7.4, quantity: 1 },
    ],
    notableItems: [], summary: "Illustrative grocery sample. No stated coverage.", warranty: null,
  },
  {
    ...base, ...at("2026-10-18"), id: 914, merchant: "Fieldnote Goods", category: "Clothing & Apparel",
    purchaseDate: "2026-10-18", total: 64, originalFileName: "fieldnote-sample.pdf",
    ocrText: "FICTIONAL SAMPLE RECEIPT",
    products: [
      { lineId: "l_usfield00001", name: "Cotton shirt", price: 38, quantity: 1 },
      { lineId: "l_usfield00002", name: "Wool scarf", price: 26, quantity: 1 },
    ],
    notableItems: [], summary: "Illustrative clothing sample. No stated coverage.", warranty: null,
  },
  {
    ...base, ...at("2026-10-30"), id: 915, merchant: "Maple Press", category: "Entertainment",
    purchaseDate: "2026-10-30", total: 24, originalFileName: "maple-sample.pdf",
    ocrText: "FICTIONAL SAMPLE RECEIPT",
    products: [
      { lineId: "l_usmaple00001", name: "Paperback novel", price: 16, quantity: 1 },
      { lineId: "l_usmaple00002", name: "Blank notebook", price: 8, quantity: 1 },
    ],
    notableItems: [], summary: "Illustrative sample. No stated coverage.", warranty: null,
  },
];

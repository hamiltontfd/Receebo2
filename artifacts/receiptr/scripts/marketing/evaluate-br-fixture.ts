// Pure calculation only. No API, DB, app startup, or file writes.
// Redirect stdout for inspection; update the locked JSON only after review.
import { evaluateItemRights } from "../../../api-server/src/lib/itemCoverage";
import { brCapturedAt, brReceipts } from "./br-collection.mjs";

export const evaluatedBrRights = brReceipts.map((receipt) => evaluateItemRights(receipt.products, {
  region: "PT", // Existing non-US evaluator branch; purchaseCountry BR selects CDC.
  purchaseCountry: receipt.purchaseCountry,
  currency: receipt.currency,
  merchant: receipt.merchant,
  purchaseDate: receipt.purchaseDate,
  deliveryDate: receipt.deliveryDate,
  isOnlinePurchase: receipt.isOnlinePurchase,
  purchaseType: "goods",
  asOf: brCapturedAt.slice(0, 10),
}));

console.log(JSON.stringify(evaluatedBrRights, null, 2));

import jsPDF from "jspdf";
import { format } from "date-fns";

export type ReceiptForPdf = {
  merchant?: string | null;
  purchaseDate?: string | null;
  createdAt: string;
  total?: number | null;
  currency?: string | null;
  category?: string | null;
  summary?: string | null;
  transactionNumber?: string | null;
  warranty?: string | null;
  originalFileName: string;
  products?: Array<{ name: string; price?: number | null; quantity?: number | null }> | null;
  notableItems?: Array<{ name: string; price?: number | null; category?: string | null; reason?: string | null }> | null;
};

const BLACK: [number, number, number] = [15, 15, 15];
const MUTED: [number, number, number] = [120, 120, 120];
const DIVIDER: [number, number, number] = [220, 220, 220];

export function generateReceiptPdf(receipt: ReceiptForPdf, currencySymbol: string): Blob {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed = 40) => {
    if (y + needed > pageH - 60) {
      doc.addPage();
      y = margin;
    }
  };

  const divider = (gap = 16) => {
    y += gap / 2;
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += gap / 2;
  };

  const label = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(text.toUpperCase(), margin, y);
    y += 14;
  };

  // ── App header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("RECEIPTR", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    format(new Date(), "MMMM d, yyyy"),
    pageW - margin,
    y,
    { align: "right" },
  );
  y += 8;
  divider(16);

  // ── Merchant name ──
  const merchant = receipt.merchant || receipt.originalFileName;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...BLACK);
  const merchantLines = doc.splitTextToSize(merchant, contentW);
  doc.text(merchantLines, margin, y);
  y += merchantLines.length * 30;

  // Date + category
  const dateStr = receipt.purchaseDate
    ? format(new Date(receipt.purchaseDate), "MMMM d, yyyy")
    : format(new Date(receipt.createdAt), "MMMM d, yyyy");
  const dateCat = receipt.category ? `${dateStr}  ·  ${receipt.category}` : dateStr;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(dateCat, margin, y);
  y += 16;

  // Transaction number
  if (receipt.transactionNumber) {
    doc.setFontSize(10);
    doc.text(`#${receipt.transactionNumber}`, margin, y);
    y += 14;
  }

  divider(24);

  // ── Total ──
  if (receipt.total != null) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.setTextColor(...BLACK);
    doc.text(`${currencySymbol}${receipt.total.toFixed(2)}`, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("TOTAL", pageW - margin, y, { align: "right" });
    y += 10;
    divider(24);
  }

  // ── Summary ──
  if (receipt.summary) {
    checkPage(60);
    label("Summary");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    const lines = doc.splitTextToSize(receipt.summary, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 8;
    divider(20);
  }

  // ── Highlights ──
  if (receipt.notableItems && receipt.notableItems.length > 0) {
    checkPage(60);
    label("Highlights");
    for (const item of receipt.notableItems) {
      checkPage(50);
      const nameLines = doc.splitTextToSize(item.name, contentW - 90);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BLACK);
      doc.text(nameLines, margin, y);

      if (item.price != null) {
        doc.text(`${currencySymbol}${item.price.toFixed(2)}`, pageW - margin, y, { align: "right" });
      }
      y += nameLines.length * 14;

      if (item.reason) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...MUTED);
        const reasonLines = doc.splitTextToSize(item.reason, contentW);
        doc.text(reasonLines, margin, y);
        y += reasonLines.length * 12;
      }
      y += 10;
    }
    divider(20);
  }

  // ── Items ──
  if (receipt.products && receipt.products.length > 0) {
    checkPage(60);
    label("Items");
    for (const product of receipt.products) {
      checkPage(30);
      const qtyPrefix = product.quantity && product.quantity > 1 ? `×${product.quantity}  ` : "";
      const nameLines = doc.splitTextToSize(`${qtyPrefix}${product.name}`, contentW - 90);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...BLACK);
      doc.text(nameLines, margin, y);

      if (product.price != null) {
        doc.setFont("helvetica", "bold");
        doc.text(`${currencySymbol}${product.price.toFixed(2)}`, pageW - margin, y, { align: "right" });
      }
      y += nameLines.length * 14 + 4;
    }
    y += 4;
    divider(20);
  }

  // ── Warranty ──
  if (receipt.warranty) {
    checkPage(60);
    label("Warranty");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    const lines = doc.splitTextToSize(receipt.warranty, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 8;
    divider(20);
  }

  // ── Footer ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Generated by Receiptr", margin, pageH - 28);
  doc.text(new Date().toISOString(), pageW - margin, pageH - 28, { align: "right" });

  return doc.output("blob");
}

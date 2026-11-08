// The pictured sample and the fixture lines are the same words.
// This is not a retailer logo and not a policy document.

export function moneyLabel(receipt, amount) {
  const formatted = Number(amount).toFixed(2);
  return receipt.currency === "USD" ? `$${formatted}` : `€${formatted}`;
}

export function sampleDocumentLines(receipt) {
  const lines = [
    "FICTIONAL SAMPLE · NOT VALID FOR PURCHASE",
    receipt.merchant,
    receipt.isOnlinePurchase ? "Online purchase" : "In-store purchase",
    receipt.purchaseCountry ? `Purchase country ${receipt.purchaseCountry}` : "Purchase country not stated",
    receipt.purchaseDate,
  ];
  for (const product of receipt.products) {
    lines.push(`${product.name}    ${product.quantity ?? 1} x ${moneyLabel(receipt, product.price)}`);
  }
  lines.push(`Total ${moneyLabel(receipt, receipt.total)}`);
  lines.push("Illustrative sample for Receebo. Not a store policy.");
  const evidence = [];
  for (const product of receipt.products) {
    for (const coverage of product.coverages ?? []) {
      if (coverage.evidence && !evidence.includes(coverage.evidence)) evidence.push(coverage.evidence);
    }
  }
  return lines.concat(evidence);
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** A one-page text PDF. No images and no retailer marks. */
export function illustrativePdf(lines) {
  const commands = ["BT", "/F1 11 Tf"];
  let y = 750;
  for (const line of lines) {
    commands.push(`1 0 0 1 54 ${y} Tm (${pdfEscape(line)}) Tj`);
    y -= 16;
    if (y < 54) break;
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export function sampleDocumentHtml(lines) {
  const body = lines.map(line => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("");
  return `<html><body style="margin:0;padding:48px;background:#fff;font:20px monospace;color:#171717">${body}</body></html>`;
}

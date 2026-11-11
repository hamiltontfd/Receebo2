// The pictured sample and the fixture lines are the same words.
// This is not a retailer logo and not a policy document.

const documentCopy = {
  en: {
    locale: "en-US", sample: "FICTIONAL SAMPLE · NOT VALID FOR PURCHASE",
    online: "Online purchase", store: "In-store purchase", country: "Purchase country",
    missingCountry: "Purchase country not stated", delivery: "Delivered",
    note: "Illustrative sample for Receebo. Not a store policy.",
  },
  "pt-PT": {
    locale: "pt-PT", sample: "EXEMPLO FICTÍCIO · NÃO É UM COMPROVATIVO DE COMPRA",
    online: "Compra online", store: "Compra em loja", country: "País da compra",
    missingCountry: "País da compra não indicado", delivery: "Entregue em",
    note: "Exemplo fictício para o Receebo. Não é uma política de loja.",
  },
  "pt-BR": {
    locale: "pt-BR", sample: "EXEMPLO FICTÍCIO · NÃO É UM COMPROVANTE DE COMPRA",
    online: "Compra online", store: "Compra em loja", country: "País da compra",
    missingCountry: "País da compra não informado", delivery: "Entregue em",
    note: "Exemplo fictício para o Receebo. Não é uma política de loja.",
  },
};

export function receiptLanguage(receipt) {
  return receipt.currency === "BRL" ? "pt-BR" : receipt.currency === "USD" ? "en" : "pt-PT";
}

export function moneyLabel(receipt, amount, language = receiptLanguage(receipt)) {
  return new Intl.NumberFormat(documentCopy[language].locale, {
    style: "currency", currency: receipt.currency,
  }).format(amount);
}

export function sampleDocumentLines(receipt, language = receiptLanguage(receipt)) {
  const copy = documentCopy[language];
  if (!copy) throw new Error("Unsupported sample document language");
  const lines = [
    copy.sample,
    receipt.merchant,
    receipt.isOnlinePurchase ? copy.online : copy.store,
    receipt.purchaseCountry ? `${copy.country} ${receipt.purchaseCountry}` : copy.missingCountry,
    receipt.purchaseDate,
  ];
  if (receipt.deliveryDate) lines.push(`${copy.delivery} ${receipt.deliveryDate}`);
  for (const product of receipt.products) {
    lines.push(`${product.name}    ${product.quantity ?? 1} x ${moneyLabel(receipt, product.price, language)}`);
  }
  lines.push(`Total ${moneyLabel(receipt, receipt.total, language)}`);
  lines.push(copy.note);
  const evidence = [];
  for (const product of receipt.products) {
    for (const coverage of product.coverages ?? []) {
      // Only fictional manufacturer terms from this receipt, never legal rules.
      // Existing EU fixtures have English evidence; express the same stated
      // duration in Portuguese in the sample document, not an invented policy.
      const text = language === "pt-PT" && coverage.warrantyType === "manufacturer" && coverage.lengthMonths
        ? `Exemplo fictício: ${product.name}, garantia do fabricante de ${coverage.lengthMonths} meses.`
        : coverage.evidence;
      if (text && !evidence.includes(text)) evidence.push(text);
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

export function sampleDocumentHtml(lines, language = "en") {
  const body = lines.map(line => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("");
  return `<html lang="${language}"><meta charset="utf-8"><body style="margin:0;padding:40px;background:#fff;font:18px monospace;color:#171717">${body}</body></html>`;
}

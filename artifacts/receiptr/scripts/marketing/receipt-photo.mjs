import { moneyLabel } from "./sample-document.mjs";

const copy = {
  "pt-PT": {
    locale: "pt-PT", sample: "Exemplo fictício", invalid: "Não é um comprovativo de compra",
    online: "Compra online", store: "Compra em loja", delivery: "Entregue em",
    date: "Data", total: "TOTAL", terms: "Notas fictícias do fabricante",
  },
  en: {
    locale: "en-US", sample: "Fictional sample", invalid: "Not valid for purchase",
    online: "Online purchase", store: "In-store purchase", delivery: "Delivered",
    date: "Date", total: "TOTAL", terms: "Fictional manufacturer notes",
  },
  "pt-BR": {
    locale: "pt-BR", sample: "Exemplo fictício", invalid: "Não é um comprovante de compra",
    online: "Compra online", store: "Compra em loja", delivery: "Entregue em",
    date: "Data", total: "TOTAL", terms: "Notas fictícias do fabricante",
  },
};
const escape = text => String(text).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

/** Fixture evidence only: no itemRights or legal rules are used in this scene. */
export function receiptPhotoHtml(receipt, language, market) {
  const text = copy[language];
  const place = { PT: "Braga, Portugal", US: "United States", BR: "Brasil" }[market];
  if (!text || !place) throw new Error("Unsupported receipt photograph context");
  const date = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected a fixture calendar date");
    return new Intl.DateTimeFormat(text.locale, {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  };
  const terms = [...new Set(receipt.products.flatMap(product =>
    (product.coverages ?? [])
      .filter(c => c.kind === "warranty" && c.warrantyType === "manufacturer" && c.evidence)
      .map(c => c.evidence),
  ))];
  const rows = receipt.products.map(product =>
    `<tr><td>${escape(product.quantity ?? 1)} × ${escape(product.name)}</td><td>${escape(moneyLabel(receipt, product.price, language))}</td></tr>`,
  ).join("");
  return `<!doctype html><html lang="${escape(text.locale)}"><meta charset="utf-8">
<style>
*{box-sizing:border-box}html,body{margin:0;width:720px;height:1280px;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;background:
radial-gradient(ellipse at 48% 42%,transparent 26%,#0009 100%),
repeating-linear-gradient(1deg,#38271e 0px,#38271e 3px,#322219 5px,#3b2a20 8px,#302119 11px);
font-family:ui-monospace,"Courier New",monospace;color:#24211e}
article{width:520px;padding:32px 24px;background:
repeating-linear-gradient(#fffdf4 0px,#fffdf4 3px,#f8f5ea 4px);
transform:rotate(-2deg);box-shadow:7px 16px 25px #0008,1px 3px 5px #0007}
header{text-align:center;border-bottom:1px dashed #777;padding-bottom:20px}
h1{font-size:22px;line-height:1.25;margin:14px 0 8px}
p{font-size:16px;line-height:1.5;margin:6px 0}
.sample{font-size:19px;font-weight:bold}.invalid{font-size:14px}
.details{margin:18px 0}.details p{font-size:16px}
table{width:100%;border-collapse:collapse;font-size:16px;line-height:1.65}
td{padding:3px 0;white-space:nowrap}td:first-child{padding-right:12px}
td:last-child{text-align:right}
.total{display:flex;justify-content:space-between;border-top:1px dashed #777;
margin-top:18px;padding-top:18px;font-weight:bold;font-size:24px}
footer{border-top:1px dashed #777;margin-top:22px;padding-top:14px}
footer p{font-size:13px;line-height:1.45}.note-title{font-weight:bold}
</style><body><article>
<header><div class="sample">${escape(text.sample)}</div>
<p class="invalid">${escape(text.invalid)}</p>
<h1>${escape(receipt.merchant)}</h1><p>${escape(place)}</p></header>
<div class="details"><p>${escape(receipt.isOnlinePurchase ? text.online : text.store)}</p>
<p>${escape(text.date)}: ${escape(date(receipt.purchaseDate))}</p>
${receipt.deliveryDate ? `<p>${escape(text.delivery)}: ${escape(date(receipt.deliveryDate))}</p>` : ""}</div>
<table><tbody>${rows}</tbody></table>
<div class="total"><span>${escape(text.total)}</span><span>${escape(moneyLabel(receipt, receipt.total, language))}</span></div>
<footer>${terms.length ? `<p class="note-title">${escape(text.terms)}</p>${terms.map(term => `<p>${escape(term)}</p>`).join("")}` : ""}
<p>${escape(text.sample)} · ${escape(text.invalid)}</p></footer>
</article></body></html>`;
}

/** Serialized by Playwright; opt-in only. Never opens a physical camera. */
export function installReceiptCameraStream({ dataUrl }) {
  if (!navigator.mediaDevices) throw new Error("Capture requires mediaDevices");
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: async constraints => {
      if (!constraints?.video) throw new DOMException("Capture supports video only", "NotSupportedError");
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const paint = canvas.getContext("2d");
      if (!paint) throw new Error("Capture requires a canvas 2D context");
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const draw = () => paint.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      draw();
      const stream = canvas.captureStream(5);
      const timer = setInterval(draw, 200);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      window.__receeboReceiptCameraReady = true;
      return stream;
    },
  });
}

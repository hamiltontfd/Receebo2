// Static, self-contained comparison for human review. No API/backend is started.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { iconBrowserOptions } from "./icon-browser.mjs";

const root = resolve(import.meta.dirname, "../public");
const output = resolve(import.meta.dirname, "../../../generated-artifacts/icons");
await mkdir(output, { recursive: true });
const asset = async (file, mime = "image/png") =>
  `data:${mime};base64,${(await readFile(resolve(root, file))).toString("base64")}`;
const mark = await asset("favicon-outline.svg", "image/svg+xml");
const png = await asset("icons/receebo-outline-192.png");
const apple = await asset("icons/receebo-outline-180.png");
const maskable = await asset("icons/receebo-outline-maskable-512.png");
const ico = await asset("favicon-outline.ico", "image/x-icon");
const original = await readFile(resolve(root, "logo-mark.svg"), "utf8");
const parts = original.replace(/^<svg[^>]+>\n/, "").replace(/<\/svg>\s*$/, "");
const before = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="white"/><g transform="translate(48 48) scale(${416 / 48}) translate(-3 -3)">${parts}</g></svg>`).toString("base64")}`;
const img = (src, size, caption, css = "") => `<figure><img src="${src}" width="${size}" height="${size}" style="${css}"><figcaption>${caption}</figcaption></figure>`;
const panel = (dark) => `<section class="${dark ? "dark" : "light"}"><h2>Fundo ${dark ? "escuro" : "claro"}</h2>
<div class="row">${img(before, 96, "Antes: placa branca")}${img(png, 96, "Agora: transparente")}${img(apple, 96, "Apple: opaco escuro")}${img(maskable, 96, "Maskable: original")}${img(maskable, 96, "Máscara circular¹", "border-radius:50%")}</div>
<h3>Tamanhos reais · SVG / PNG / ICO</h3>
${[["SVG", mark], ["PNG", png], ["ICO", ico]].map(([label, src]) => `<div class="small"><b>${label}</b>${[16, 24, 32, 48].map((s) => img(src, s, `${s}px`)).join("")}</div>`).join("")}</section>`;
const html = `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Receebo — comparação de ícones</title>
<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#e9e9ec;color:#202020;font:14px system-ui}h1{font-size:23px;margin:0 0 8px}p{margin:0 0 16px}main{display:grid;grid-template-columns:1fr 1fr;gap:18px}section{padding:20px;border-radius:14px}.light{background:#fff}.dark{background:#303037;color:#fff}h2{font-size:17px;margin:0 0 22px}h3{font-size:14px;margin:25px 0 8px}.row{display:flex;flex-wrap:wrap;gap:18px}figure{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:9px}figcaption{font-size:11px;max-width:100px;text-align:center}img{object-fit:contain;display:block}.small{display:flex;align-items:center;gap:26px;min-height:85px}.small b{width:30px}footer{margin-top:16px;font-size:12px}</style>
<h1>Receebo — símbolo original, sem placa branca externa</h1><p>O branco interno e a geometria foram preservados. PNGs e ICOs reais, sem ampliar os tamanhos indicados.</p>
<main>${panel(false)}${panel(true)}</main><footer>¹ Simulação da área circular, não captura do sistema operacional. Apple e maskable têm fundo escuro opaco por compatibilidade.</footer></html>`;
await writeFile(resolve(output, "comparison.html"), html);
const browser = await chromium.launch({
  ...iconBrowserOptions(),
});
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(async () => { await Promise.all([...document.images].map((image) => image.decode())); });
  await page.screenshot({ path: resolve(output, "comparison.png"), fullPage: true });
  console.log(resolve(output, "comparison.png"));
} finally { await browser.close(); }

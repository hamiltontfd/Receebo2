// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicPages } from "@/lib/publicSeo";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const speedClaim = /in seconds|em segundos|in under 10 seconds|em menos de 10 segundos|instantly|encontra logo|na hora|straight away|vê logo/i;

describe("landing copy without unproven speed claims", () => {
  it.each([
    "HeroSection.tsx", "DemoSection.tsx", "FAQSection.tsx",
    "AIExtractionSection.tsx", "UsReturnsSection.tsx",
  ])("%s has no product-speed claim", (file) => {
    expect(source(`./${file}`)).not.toMatch(speedClaim);
  });

  it("retains capture and search capabilities in all three locales", () => {
    const hero = source("./HeroSection.tsx");
    for (const text of [
      "Scan or import from Outlook. Find any purchase.",
      "Digitaliza ou importa do Outlook. Encontra qualquer compra.",
      "Escaneie ou importe do Outlook. Encontre qualquer compra.",
    ]) expect(hero).toContain(text);
    const demo = source("./DemoSection.tsx");
    for (const text of [
      "Scan, upload or import receipts.",
      "Digitaliza, carrega ou importa recibos.",
      "Escaneie, envie ou importe recibos.",
      "Search products, stores or brands and find the receipt you need.",
      "Pesquisa produtos, lojas ou marcas e encontra o recibo de que precisas.",
      "Pesquise produtos, lojas ou marcas e encontre o recibo de que precisa.",
    ]) expect(demo).toContain(text);
  });

  it("retains camera, upload, email connection and AI reading in the FAQ", () => {
    const faq = source("./FAQSection.tsx");
    for (const text of [
      "phone camera, upload a PDF or image, or connect",
      "câmara do telemóvel, carrega um PDF ou imagem, ou liga",
      "câmera do celular, envie um PDF ou imagem, ou conecte",
      "Our AI reads and indexes every detail — merchant, products, prices, warranties.",
      "A nossa IA lê e indexa cada detalhe — loja, produtos, preços, garantias.",
      "Nossa IA lê e indexa cada detalhe — loja, produtos, preços, garantias.",
    ]) expect(faq).toContain(text);
    expect(source("./AIExtractionSection.tsx")).toContain("Our AI reads every detail");
  });

  it("uses the same speed-free description in the HTML and public SEO map", () => {
    const description = "Scan or import from Outlook. Find any purchase. Never miss a return or warranty date.";
    expect(publicPages["/"].description).toBe(description);
    const html = source("../../../index.html");
    expect(html).not.toMatch(speedClaim);
    expect(html.match(new RegExp(`content="${description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"))).toHaveLength(3);
  });

  it("keeps the promo title about the video duration", () => {
    const promo = source("./PromoVideoSection.tsx");
    expect(promo).toContain("Receebo in 30 seconds");
    expect(promo).toContain("Receebo em 30 segundos");
  });
});

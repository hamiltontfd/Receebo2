// Isolated, fictional pt-BR purchases. Never sent to a backend or an account.
// Only manufacturer terms are stated here; all CDC facts come from the evaluator.
const base = {
  status: "completed", currency: "BRL", purchaseCountry: "BR",
  isOnlinePurchase: false, deliveryDate: null, isDraft: false, contentType: "image/png",
  objectPath: "/objects/sample-receipt.png", originalFileName: "amostra-ficticia-br.png",
  attachments: [], transactionNumber: null, ocrText: "RECIBO FICTÍCIO DE EXEMPLO",
};
const at = date => ({ createdAt: `${date}T15:00:00Z`, updatedAt: `${date}T15:00:00Z` });
const manufacturer = (id, lengthMonths, evidence) => ({
  id, kind: "warranty", warrantyType: "manufacturer", basis: "stated",
  certainty: "estimated", lengthDays: null, lengthMonths, endDate: null,
  evidence, source: "extraction",
});
const tvEvidence = "Exemplo fictício: Smart TV 4K de 55 polegadas, garantia do fabricante de 24 meses.";
const barEvidence = "Exemplo fictício: soundbar de exemplo, garantia do fabricante de 12 meses.";

export const brCapturedAt = "2026-11-08T15:00:00Z";
export const brReceipts = [
  {
    ...base, ...at("2026-11-02"), id: 921,
    merchant: "Loja Fictícia Aurora de Papel", category: "Electronics",
    purchaseDate: "2026-11-02", deliveryDate: "2026-11-05", isOnlinePurchase: true,
    total: 3199,
    ocrText: ["RECIBO FICTÍCIO DE EXEMPLO", tvEvidence, barEvidence].join("\n"),
    products: [
      {
        lineId: "l_brauroratv001", name: "Smart TV 4K de 55 polegadas", price: 2499, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [manufacturer("c_brauroratv001", 24, tvEvidence)],
      },
      {
        lineId: "l_braurorabar01", name: "Soundbar de exemplo", price: 649, quantity: 1,
        category: "Electronics", categorySource: "extraction",
        coverages: [manufacturer("c_braurorabar01", 12, barEvidence)],
      },
      { lineId: "l_brauroracabo1", name: "Cabo HDMI", price: 51, quantity: 1 },
    ],
    notableItems: [
      { name: "Smart TV 4K de 55 polegadas", price: 2499, category: "Electronics", reason: "Destaque fictício de exemplo." },
      { name: "Soundbar de exemplo", price: 649, category: "Electronics", reason: "Destaque fictício de exemplo." },
    ],
    summary: "Compra online fictícia, entregue no Brasil. Dados de exemplo: TV, soundbar e cabo HDMI.",
    warranty: `${tvEvidence}\n${barEvidence}`,
  },
  {
    ...base, ...at("2026-10-28"), id: 922,
    merchant: "Casa Fictícia Nuvem de Cartão", category: "Home",
    purchaseDate: "2026-10-28", total: 499,
    products: [{ lineId: "l_brnuvemasp001", name: "Aspirador de exemplo", price: 499, quantity: 1, category: "Home", categorySource: "extraction" }],
    notableItems: [], summary: "Compra fictícia de um aspirador. Dados de exemplo.", warranty: null,
  },
  {
    ...base, ...at("2026-11-04"), id: 923,
    merchant: "Mercado Fictício Jardim de Papel", category: "Groceries",
    purchaseDate: "2026-11-04", total: 78.5,
    products: [
      { lineId: "l_brjardimcafe1", name: "Café de exemplo", price: 28.5, quantity: 1 },
      { lineId: "l_brjardimfrut1", name: "Frutas de exemplo", price: 50, quantity: 1 },
    ],
    notableItems: [], summary: "Compras de mercado fictícias. Dados de exemplo.", warranty: null,
  },
  {
    ...base, ...at("2026-10-30"), id: 924,
    merchant: "Ateliê Fictício Linha de Nuvem", category: "Clothing & Apparel",
    purchaseDate: "2026-10-30", total: 159.9,
    products: [{ lineId: "l_brlinhacam001", name: "Camisa de exemplo", price: 159.9, quantity: 1 }],
    notableItems: [], summary: "Compra fictícia de uma camisa. Dados de exemplo.", warranty: null,
  },
];

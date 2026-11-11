// Real app labels from appCopy.ts. Keep localization here, not in product UI.
export const captureLabels = {
  "pt-PT": {
    save: "Guardar compra", search: "Pesquisar compras...",
    dismissOriginal: "Fechar recibo em ecrã inteiro",
    disclosure: "Dados de exemplo · compras fictícias · extração simulada",
  },
  en: {
    save: "Save Purchase", search: "Search purchases...",
    dismissOriginal: "Dismiss full-screen receipt view",
    disclosure: "Sample data · fictional purchases · simulated extraction",
  },
  "pt-BR": {
    save: "Salvar compra", search: "Buscar compras...",
    dismissOriginal: "Fechar recibo em tela cheia",
    disclosure: "Dados de exemplo · compras fictícias · extração simulada",
  },
};

export function captureLocators(page, language) {
  const labels = captureLabels[language];
  if (!labels) throw new Error("Unsupported capture language");
  return {
    save: page.getByRole("button", { name: labels.save, exact: true }),
    search: page.getByPlaceholder(labels.search, { exact: true }),
    original: page.getByTestId("button-view-original"),
    originalImage: page.getByRole("button", { name: labels.dismissOriginal, exact: true }).locator("img"),
  };
}

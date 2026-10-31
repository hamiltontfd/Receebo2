import { getAppLocale } from "./locale";

const en = {
  region: "Region",
  aboutRegion: "About region",
  chooseMarket: "Choose region",
  labels: { PT: "Portugal / European Union", BR: "Brazil", US: "United States" },
  shortLabels: { PT: "PT / EU", BR: "BR", US: "US" },
  saving: "Saving",
  retry: "Retry",
  confirmed: "Confirmed",
  suggestion: "Suggested from your approximate location. You can change it.",
  confirm: "Confirm",
  unknown: "Location unavailable. Choose your region, or keep browsing.",
  disclaimer: "Your account market is a preference, not legal validation. It does not change the country of your purchases, receipt or subscription currency, or the app language. Brazil and United States documents are not locally approved yet; the existing terms continue to apply. If local location detection fails, your browser may contact country.is, which receives your IP address, to suggest a country. Receebo does not store that IP. See the Privacy Policy for details.",
};
const pt: typeof en = {
  region: "Região",
  aboutRegion: "Sobre a região",
  chooseMarket: "Escolher região",
  labels: { PT: "Portugal / União Europeia", BR: "Brasil", US: "Estados Unidos" },
  shortLabels: { PT: "PT / UE", BR: "BR", US: "EUA" },
  saving: "A guardar",
  retry: "Tentar novamente",
  confirmed: "Confirmado",
  suggestion: "Sugerido pela sua localização aproximada. Pode alterar.",
  confirm: "Confirmar",
  unknown: "Localização indisponível. Escolha a região ou continue a navegar.",
  disclaimer: "O mercado da conta é uma preferência, não uma validação jurídica. Não altera o país das compras, a moeda dos recibos ou da assinatura, nem o idioma da aplicação. Os documentos do Brasil e dos Estados Unidos ainda não têm aprovação jurídica local; continuam a aplicar-se os termos existentes. Se a deteção local falhar, o navegador pode consultar country.is, que recebe o seu IP, para sugerir o país. O Receebo não guarda esse IP. Consulte a Política de Privacidade.",
};
export function getMarketCopy(): typeof en {
  const locale = getAppLocale();
  if (locale === "en") return en;
  return locale === "pt-BR" ? {
    ...pt, saving: "Salvando",
    suggestion: "Sugerido pela sua localização aproximada. Você pode alterar.",
    unknown: "Localização indisponível. Escolha a região ou continue navegando.",
    disclaimer: "O mercado da conta é uma preferência, não uma validação jurídica. Não altera o país das compras, a moeda dos recibos ou da assinatura, nem o idioma do aplicativo. Os documentos do Brasil e dos Estados Unidos ainda não têm aprovação jurídica local; os termos existentes continuam válidos. Se a detecção local falhar, o navegador pode consultar country.is, que recebe seu IP, para sugerir o país. O Receebo não armazena esse IP. Consulte a Política de Privacidade.",
  } : pt;
}

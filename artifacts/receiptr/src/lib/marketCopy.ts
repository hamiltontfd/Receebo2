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
  disclaimer: "Your region decides which return and warranty rules Receebo shows. United States: each store's return policy, online and in store, plus the manufacturer's warranty. Portugal / European Union and Brazil: the European rules, for now. It doesn't change the country of your purchases, their currency, your subscription or the app language. We set it once from your approximate location: our server looks up your IP address in a local database and doesn't keep it. You can change it here any time.",
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
  disclaimer: "A região decide que regras de devolução e garantia o Receebo mostra. Estados Unidos: a política de devolução de cada loja, online e em loja física, e a garantia do fabricante. Portugal / União Europeia e Brasil: as regras europeias, por agora. Não altera o país das compras, a moeda, a subscrição nem o idioma da aplicação. Definimo-la uma vez a partir da sua localização aproximada: o nosso servidor consulta o seu IP numa base de dados local e não o guarda. Pode alterá-la aqui a qualquer momento.",
};
export function getMarketCopy(): typeof en {
  const locale = getAppLocale();
  if (locale === "en") return en;
  return locale === "pt-BR" ? {
    ...pt, saving: "Salvando",
    suggestion: "Sugerido pela sua localização aproximada. Você pode alterar.",
    unknown: "Localização indisponível. Escolha a região ou continue navegando.",
    disclaimer: "A região define quais regras de devolução e garantia o Receebo mostra. Estados Unidos: a política de devolução de cada loja, online e na loja física, e a garantia do fabricante. Portugal / União Europeia e Brasil: as regras europeias, por enquanto. Não muda o país das compras, a moeda, a assinatura nem o idioma do aplicativo. Definimos uma vez a partir da sua localização aproximada: nosso servidor consulta seu IP em uma base de dados local e não o armazena. Você pode alterar aqui a qualquer momento.",
  } : pt;
}

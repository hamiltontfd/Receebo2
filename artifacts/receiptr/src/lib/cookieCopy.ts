import { getAppLocale, type AppLocale } from "./locale";

type Copy = Record<string, readonly [string, string, string]>;

const COPY: Copy = {
  title: ["Cookies on Receebo", "Cookies no Receebo", "Cookies no Receebo"],
  euLead: [
    "We use essential cookies to run the account. Optional cookies stay off until you accept them.",
    "Usamos cookies essenciais para a conta. Os cookies opcionais ficam desligados até aceitar.",
    "Usamos cookies essenciais para a conta. Os cookies opcionais ficam desligados até você aceitar.",
  ],
  usLead: [
    "We use cookies to run Receebo and, unless you opt out, to measure our own ads. California residents can opt out of sale or sharing.",
    "Usamos cookies para o Receebo funcionar e, salvo oposição, para medir os nossos anúncios.",
    "Usamos cookies para o Receebo funcionar e, salvo oposição, para medir nossos anúncios.",
  ],
  accept: ["Accept", "Aceitar", "Aceitar"],
  optOutConfirmed: [
    "Your opt-out is saved. Marketing and ad attribution are off.",
    "A sua oposição foi guardada. O marketing e a atribuição de anúncios estão desligados.",
    "Sua opção foi salva. Marketing e atribuição de anúncios estão desativados.",
  ],
  reject: ["Reject", "Recusar", "Recusar"],
  preferences: ["Preferences", "Preferências", "Preferências"],
  save: ["Save choices", "Guardar escolhas", "Salvar escolhas"],
  essential: ["Essential", "Essenciais", "Essenciais"],
  essentialHelp: [
    "Required for sign-in (Clerk) and payments (Stripe). Always on.",
    "Necessários para iniciar sessão (Clerk) e pagamentos (Stripe). Estão sempre ligados.",
    "Necessários para entrar (Clerk) e pagamentos (Stripe). Estão sempre ligados.",
  ],
  prefs: ["Preferences", "Preferências", "Preferências"],
  prefsHelp: [
    "Remembers optional installation-bar dismissals and country-interest submissions.",
    "Recorda o fecho opcional do aviso de instalação e o interesse já enviado num país.",
    "Lembra o fechamento opcional do aviso de instalação e o interesse já enviado em um país.",
  ],
  attribution: ["Ad attribution", "Atribuição de anúncios", "Atribuição de anúncios"],
  attributionHelp: [
    "Stores the ad link that brought you here until you create an account, so we know which campaign started the trial.",
    "Guarda a ligação do anúncio que o trouxe aqui até criar conta, para sabermos que campanha iniciou o período experimental.",
    "Guarda o link do anúncio que trouxe você aqui até criar a conta, para sabermos qual campanha iniciou o teste.",
  ],
  marketing: ["Marketing", "Marketing", "Marketing"],
  marketingHelp: [
    "Meta Pixel and Conversions API measure page views, account creation and subscription. Off until you opt in outside the US.",
    "O Pixel da Meta e a API de conversões medem páginas, criação de conta e subscrição. Fora dos EUA ficam desligados até optar.",
    "O Pixel da Meta e a API de conversões medem páginas, criação de conta e assinatura. Fora dos EUA ficam desligados até você optar.",
  ],
  doNotSell: ["Do Not Sell or Share My Personal Information", "Não vender nem partilhar os meus dados", "Não vender nem compartilhar meus dados"],
  cookiePolicy: ["Cookie Policy", "Política de cookies", "Política de cookies"],
  cookieSettings: ["Cookie settings", "Definições de cookies", "Configurações de cookies"],
};

export function cookieText(key: keyof typeof COPY, locale: AppLocale = getAppLocale()): string {
  const row = COPY[key];
  if (locale === "pt-BR") return row[2];
  if (locale === "pt-PT") return row[1];
  return row[0];
}

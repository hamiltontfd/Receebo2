import { LegalPageLayout } from "@/components/LegalPageLayout";
import { LegalDraftNotice } from "@/components/LegalDraftNotice";
import { useAppLocale } from "@/lib/locale";
import { Link, useLocation } from "wouter";

// DRAFT pending legal review. English is used for /us (?region=us). EU follows
// the account or browser language (en, pt-PT, pt-BR).
type Row = { name: string; purpose: string; duration: string; party: string };

export const en: Row[] = [
  { name: "Clerk session", purpose: "Signs you in and keeps the session secure.", duration: "Session, and up to the Clerk session lifetime.", party: "Clerk (essential)" },
  { name: "Stripe", purpose: "Takes payment and remembers the checkout you started.", duration: "Checkout session.", party: "Stripe (essential)" },
  { name: "receebo:cookie-consent", purpose: "Stores only your cookie choice, including rejection.", duration: "Cookie: 90 days; localStorage: until cleared.", party: "Receebo (essential)" },
  { name: "receebo:visitorMarket", purpose: "Functional: remembers your explicit PT/BR/US choice for pricing and consumer rights, not ads; adopted by your account only if unset.", duration: "Until adopted or cleared.", party: "Receebo (functional)" },
  { name: "receebo:installBarDismissedAt", purpose: "Optional preference: remembers installation-bar dismissal only when preferences are allowed.", duration: "Dismissal used for 30 days; until cleared.", party: "Receebo (preferences)" },
  { name: "receebo:marketInterestSent:${country}", purpose: "Optional preference: remembers that interest in a country was already submitted.", duration: "Until cleared.", party: "Receebo (preferences)" },
  { name: "receebo:onboarding:pending:${userId}", purpose: "Functional account-scoped retry journal so unfinished setup is not lost; not used for ads.", duration: "Until changes are saved or cleared.", party: "Receebo (functional)" },
  { name: "__clerk_environment", purpose: "Clerk-managed environment/bootstrap storage for authentication; not controlled by the marketing choice.", duration: "Managed by Clerk/browser.", party: "Clerk (essential)" },
  { name: "Service worker cache", purpose: "Caches app assets and the offline page; not advertising storage.", duration: "Until updated or site data is cleared.", party: "Receebo (functional)" },
  { name: "GAESA", purpose: "Hosting/platform-managed cookie, not set by the app or controlled by its marketing choice.", duration: "Managed by the hosting platform.", party: "Hosting (infrastructure)" },
  { name: "Landing event beacon", purpose: "Aggregate-only event counts: no browser identifier, cookie or browser storage.", duration: "No browser storage; aggregate server counts.", party: "Receebo (aggregate measurement)" },
  { name: "receebo:ad-attribution", purpose: "Stores the first ad link (UTM fields and fbclid) until you create an account.", duration: "90 days, or until sign-up is recorded.", party: "Receebo (attribution)" },
  { name: "receebo:app-open:*", purpose: "Last permitted authenticated open day (UTC), per account in this browser, to measure a return on a later day. Used only when marketing is allowed.", duration: "Until cleared or marketing is revoked.", party: "Receebo (marketing)" },
  { name: "Meta Pixel and Conversions API", purpose: "Measures page views, trial starts, the first saved trial receipt, browser return visits and subscriptions after the choice that allows marketing.", duration: "Meta’s own cookies, commonly up to 90 days. The server event is sent only for that action.", party: "Meta (marketing)" },
];

export const pt: Row[] = [
  { name: "Sessão Clerk", purpose: "Inicia a sessão e mantém a conta segura.", duration: "Sessão, até ao prazo da sessão Clerk.", party: "Clerk (essencial)" },
  { name: "Stripe", purpose: "Recebe o pagamento e recorda o checkout iniciado.", duration: "Sessão de checkout.", party: "Stripe (essencial)" },
  { name: "receebo:cookie-consent", purpose: "Guarda apenas a escolha de cookies, incluindo a recusa.", duration: "Cookie: 90 dias; localStorage: até ser apagado.", party: "Receebo (essencial)" },
  { name: "receebo:visitorMarket", purpose: "Funcional: recorda a escolha explícita PT/BR/US para preços e direitos do consumidor, não para anúncios; a conta só a adota se ainda não tiver mercado.", duration: "Até ser adotado ou apagado.", party: "Receebo (funcional)" },
  { name: "receebo:installBarDismissedAt", purpose: "Preferência opcional: recorda que fechou o aviso de instalação, apenas quando permite preferências.", duration: "Usado por 30 dias; até ser apagado.", party: "Receebo (preferências)" },
  { name: "receebo:marketInterestSent:${country}", purpose: "Preferência opcional: recorda que já enviou interesse num país.", duration: "Até ser apagado.", party: "Receebo (preferências)" },
  { name: "receebo:onboarding:pending:${userId}", purpose: "Registo funcional de repetição por conta, para não perder a configuração por guardar; não usado para anúncios.", duration: "Até guardar as alterações ou apagar.", party: "Receebo (funcional)" },
  { name: "__clerk_environment", purpose: "Armazenamento de ambiente/inicialização de autenticação gerido pelo Clerk, independente da escolha de marketing.", duration: "Gerido pelo Clerk/navegador.", party: "Clerk (essencial)" },
  { name: "Service worker cache", purpose: "Cache da aplicação e da página offline; não serve publicidade.", duration: "Até atualizar ou apagar dados do site.", party: "Receebo (funcional)" },
  { name: "GAESA", purpose: "Cookie da plataforma de alojamento, não definido pela aplicação nem controlado pela escolha de marketing.", duration: "Gerido pela plataforma de alojamento.", party: "Alojamento (infraestrutura)" },
  { name: "Landing event beacon", purpose: "Apenas contagens agregadas: sem identificador do navegador, cookie ou armazenamento no navegador.", duration: "Sem armazenamento no navegador; contagens agregadas no servidor.", party: "Receebo (medição agregada)" },
  { name: "receebo:ad-attribution", purpose: "Guarda a primeira ligação de anúncio (campos UTM e fbclid) até criar conta.", duration: "90 dias, ou até o registo ficar gravado.", party: "Receebo (atribuição)" },
  { name: "receebo:app-open:*", purpose: "Último dia UTC de abertura autenticada permitida, por conta neste navegador, para medir o regresso noutro dia. Só é usado quando o marketing está permitido.", duration: "Até ser apagado ou o marketing ser revogado.", party: "Receebo (marketing)" },
  { name: "Pixel da Meta e API de conversões", purpose: "Mede páginas, início do trial, primeiro recibo do trial guardado, regressos no navegador e subscrições depois da escolha que permite marketing.", duration: "Cookies da Meta, em geral até 90 dias. O evento de servidor só é enviado nessa ação.", party: "Meta (marketing)" },
];

export default function CookiePolicy() {
  const locale = useAppLocale();
  const [path] = useLocation();
  const us = path.includes("region=us") || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("region") === "us");
  const english = us || locale === "en";
  const rows = english ? en : pt;
  return (
    <LegalPageLayout title={english ? "Cookie Policy" : "Política de cookies"} description="Cookies and similar technologies used by Receebo." effectiveDate="9 November 2026">
      {/* DRAFT pending legal review */}
      <LegalDraftNotice />
      <p>
        {english
          ? "This draft lists the cookies and similar storage Receebo uses. Essential items run the account. Everything else waits for your choice where the law requires an opt-in, and can be refused from the banner or Cookie settings."
          : "Este rascunho lista os cookies e armazenamento semelhante que o Receebo usa. Os itens essenciais fazem a conta funcionar. O resto espera pela sua escolha quando a lei exige opt-in, e pode ser recusado no aviso ou nas definições de cookies."}
      </p>
      <p>
        <Link href="/privacy" className="underline">{english ? "Privacy Policy" : "Política de privacidade"}</Link>
      </p>
      <div className="not-prose overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-3">{english ? "Name" : "Nome"}</th>
              <th className="py-2 pr-3">{english ? "Purpose" : "Finalidade"}</th>
              <th className="py-2 pr-3">{english ? "Duration" : "Duração"}</th>
              <th className="py-2">{english ? "Who" : "Quem"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b align-top">
                <td className="py-2 pr-3 font-medium">{row.name}</td>
                <td className="py-2 pr-3">{row.purpose}</td>
                <td className="py-2 pr-3">{row.duration}</td>
                <td className="py-2">{row.party}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{english ? "How to refuse or change" : "Como recusar ou alterar"}</h2>
      <p>
        {english
          ? "Use Accept, Reject or Preferences on the cookie banner. Reject leaves only essential cookies. You can reopen Preferences later from Cookie settings in the footer. On the US pages, Do Not Sell or Share My Personal Information immediately turns off marketing and ad attribution and confirms your choice. A browser Global Privacy Control signal is treated as an opt-out of sale or sharing until you explicitly accept marketing."
          : "Use Aceitar, Recusar ou Preferências no aviso. Recusar deixa só os cookies essenciais. Pode reabrir as Preferências em Definições de cookies no rodapé. Um sinal Global Privacy Control do navegador conta como oposição à venda ou partilha até aceitar marketing explicitamente."}
      </p>
    </LegalPageLayout>
  );
}

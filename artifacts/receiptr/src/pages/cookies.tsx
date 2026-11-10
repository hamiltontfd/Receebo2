import { LegalPageLayout } from "@/components/LegalPageLayout";
import { LegalDraftNotice } from "@/components/LegalDraftNotice";
import { useAppLocale } from "@/lib/locale";
import { Link, useLocation } from "wouter";

// DRAFT pending legal review. English is used for /us (?region=us). EU follows
// the account or browser language (en, pt-PT, pt-BR).
type Row = { name: string; purpose: string; duration: string; party: string };

const en: Row[] = [
  { name: "Clerk session", purpose: "Signs you in and keeps the session secure.", duration: "Session, and up to the Clerk session lifetime.", party: "Clerk (essential)" },
  { name: "Stripe", purpose: "Takes payment and remembers the checkout you started.", duration: "Checkout session.", party: "Stripe (essential)" },
  { name: "receebo:cookie-consent", purpose: "Stores the cookie choices you make on this browser.", duration: "90 days.", party: "Receebo (preferences)" },
  { name: "receebo:ad-attribution", purpose: "Stores the first ad link (UTM fields and fbclid) until you create an account.", duration: "90 days, or until sign-up is recorded.", party: "Receebo (attribution)" },
  { name: "Meta Pixel and Conversions API", purpose: "Measures page views, new accounts and subscriptions after the choice that allows marketing.", duration: "Meta’s own cookies, commonly up to 90 days. The server event is sent only for that action.", party: "Meta (marketing)" },
];

const pt: Row[] = [
  { name: "Sessão Clerk", purpose: "Inicia a sessão e mantém a conta segura.", duration: "Sessão, até ao prazo da sessão Clerk.", party: "Clerk (essencial)" },
  { name: "Stripe", purpose: "Recebe o pagamento e recorda o checkout iniciado.", duration: "Sessão de checkout.", party: "Stripe (essencial)" },
  { name: "receebo:cookie-consent", purpose: "Guarda as escolhas de cookies neste navegador.", duration: "90 dias.", party: "Receebo (preferências)" },
  { name: "receebo:ad-attribution", purpose: "Guarda a primeira ligação de anúncio (campos UTM e fbclid) até criar conta.", duration: "90 dias, ou até o registo ficar gravado.", party: "Receebo (atribuição)" },
  { name: "Pixel da Meta e API de conversões", purpose: "Mede páginas, contas novas e subscrições depois da escolha que permite marketing.", duration: "Cookies da Meta, em geral até 90 dias. O evento de servidor só é enviado nessa ação.", party: "Meta (marketing)" },
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
          ? "Use Accept, Reject or Preferences on the cookie banner. Reject leaves only essential cookies. You can reopen Preferences later from Cookie settings in the footer. On the US pages, Do Not Sell or Share My Personal Information opens the same choices. A browser Global Privacy Control signal is treated as an opt-out of sale or sharing until you explicitly accept marketing."
          : "Use Aceitar, Recusar ou Preferências no aviso. Recusar deixa só os cookies essenciais. Pode reabrir as Preferências em Definições de cookies no rodapé. Um sinal Global Privacy Control do navegador conta como oposição à venda ou partilha até aceitar marketing explicitamente."}
      </p>
    </LegalPageLayout>
  );
}

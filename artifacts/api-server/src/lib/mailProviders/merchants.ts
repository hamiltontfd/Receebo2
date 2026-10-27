/**
 * Sender lists used to rank email candidates BEFORE any AI call.
 *
 * - "everyday": groceries, food delivery, transport, utilities, telecoms and
 *   insurance. These are skipped entirely (no AI read): Receebo imports clear
 *   purchase emails (electronics, tickets, retail), not recurring bills.
 * - "durable": stores whose receipts usually matter for warranty/returns.
 * - "tickets": event ticket sellers.
 * - "marketplace": mixed stores (could be a TV or a phone case).
 *
 * Match is on the registrable domain suffix, so mailing subdomains match too
 * (e.g. em.fnac.pt, mail.worten.pt). Update here and in candidates.test.ts.
 */
export type MerchantTier = "everyday" | "durable" | "tickets" | "marketplace";

const DOMAINS: Record<MerchantTier, string[]> = {
  everyday: [
    // Groceries / supermarkets
    "continente.pt", "sonae.pt", "pingodoce.pt", "lidl.pt", "lidl.com", "auchan.pt",
    "aldi.pt", "mercadona.pt", "mercadona.es", "minipreco.pt", "intermarche.pt",
    "spar.pt", "froiz.com",
    // Food delivery / transport
    "glovoapp.com", "uber.com", "ubereats.com", "bolt.eu", "toogoodtogo.com",
    "viaverde.pt", "cp.pt", "metrolisboa.pt", "metrodoporto.pt",
    // Utilities (electricity, gas, water) and telecoms
    "edp.pt", "edp.com", "e-redes.pt", "galp.com", "galpenergia.com", "endesa.pt",
    "iberdrola.pt", "goldenergy.pt", "repsol.pt", "epal.pt", "aguasdoporto.pt",
    "nos.pt", "meo.pt", "telecom.pt", "altice.pt", "vodafone.pt", "nowo.pt", "digi.pt",
    // Insurance
    "fidelidade.pt", "ageas.pt", "allianz.pt", "tranquilidade.pt", "generali.pt",
  ],
  durable: [
    "worten.pt", "fnac.pt", "pcdiga.com", "mediamarkt.pt", "elcorteingles.pt", "ikea.com",
    "apple.com", "leroymerlin.pt", "decathlon.pt", "decathlon.com", "zalando.pt",
    "zalando.com", "pccomponentes.pt", "pccomponentes.com", "samsung.com", "radiopopular.pt",
    "conforama.pt", "globaldata.pt", "chip7.pt", "bertrand.pt", "staples.pt",
  ],
  tickets: [
    "ticketline.pt", "seetickets.com", "everythingisnew.pt", "blueticket.pt", "bol.pt",
    "eventbrite.com", "ticketmaster.com", "ticketmaster.pt", "feverup.com", "dice.fm",
    "meogo.pt",
  ],
  marketplace: [
    "amazon.es", "amazon.com", "amazon.de", "amazon.fr", "amazon.co.uk", "amazon.it",
    "aliexpress.com", "ebay.com", "ebay.es", "temu.com", "shein.com", "paypal.com",
    "paypal.pt", "kuantokusta.pt",
  ],
};

// Display-name hints for senders that use invoicing platforms or generic
// domains (e.g. "EDP Comercial <faturas@...>").
const EVERYDAY_NAME_PATTERN =
  /\b(continente|pingo doce|lidl|auchan|aldi|mercadona|minipre[cç]o|intermarch[eé]|glovo|uber|bolt|too good to go|via verde|edp|e-redes|galp|endesa|iberdrola|goldenergy|epal|[aá]guas d[eo]|meo|nos comunica[cç][oõ]es|vodafone|nowo|digi|fidelidade|ageas|allianz|tranquilidade|generali)\b/i;

/** Extract the email address domain from a "Name <a@b.c>" sender string. */
export function senderDomain(from: string | null | undefined): string | null {
  if (!from) return null;
  const match = from.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match ? match[1]!.toLowerCase() : null;
}

function senderName(from: string | null | undefined): string {
  if (!from) return "";
  const i = from.indexOf("<");
  return (i > 0 ? from.slice(0, i) : from).replace(/["']/g, "").trim();
}

function domainMatches(domain: string, entry: string): boolean {
  return domain === entry || domain.endsWith(`.${entry}`);
}

export function merchantTier(from: string | null | undefined): MerchantTier | null {
  const domain = senderDomain(from);
  if (domain) {
    for (const tier of ["everyday", "tickets", "durable", "marketplace"] as const) {
      if (DOMAINS[tier].some((entry) => domainMatches(domain, entry))) return tier;
    }
  }
  if (EVERYDAY_NAME_PATTERN.test(senderName(from))) return "everyday";
  return null;
}

/** Merchant names (from AI extraction) that are groceries/utilities. */
export function isEverydayMerchantName(name: string | null | undefined): boolean {
  return Boolean(name && EVERYDAY_NAME_PATTERN.test(name));
}

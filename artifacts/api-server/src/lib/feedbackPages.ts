/**
 * HTML for the smile rating pages (spec §3 option A). Pure, no DB. Same
 * language as the email (locale carried in the signed token).
 */
import { createHash } from "crypto";
import { escapeHtml } from "./emailService";
import type { EmailLocale } from "./emailLocale";
import { FEEDBACK_RATINGS, type FeedbackRating } from "./feedbackToken";
import { FEEDBACK_COMMENT_MAX } from "./lifecycleEmailStore";

const SMILES: Record<FeedbackRating, string> = { good: "😀", ok: "😐", bad: "🙁" };

const PAGE_COPY = {
  en: {
    lang: "en",
    saving: "Thanks for your answer",
    savingSub: "Saving it now…",
    confirm: "Confirm",
    thanks: "Thanks! Anything you'd like to tell us? (optional)",
    send: "Send",
    placeholder: "Your message",
    done: "Thanks, we got it.",
    expired: "This link has expired",
    expiredSub: "Nothing was saved. Thanks for opening it anyway.",
    invalid: "This link doesn't work",
    labels: { good: "Good", ok: "Okay", bad: "Not good" },
    home: "Go to Receebo",
    privacyNote: "If you rated your experience with Receebo, we keep that rating anonymously after your account is deleted, with no link to you or your email.",
  },
  "pt-PT": {
    lang: "pt-PT",
    saving: "Obrigado pela resposta",
    savingSub: "A guardar…",
    confirm: "Confirmar",
    thanks: "Obrigado! Quer dizer-nos mais alguma coisa? (opcional)",
    send: "Enviar",
    placeholder: "A sua mensagem",
    done: "Obrigado, recebemos.",
    expired: "Este link expirou",
    expiredSub: "Não foi guardado nada. Obrigado por o abrir na mesma.",
    invalid: "Este link não funciona",
    labels: { good: "Bom", ok: "Mais ou menos", bad: "Mau" },
    home: "Ir para o Receebo",
    privacyNote: "Se avaliou a sua experiência com o Receebo, guardamos essa avaliação de forma anónima depois de a sua conta ser eliminada, sem qualquer ligação a si ou ao seu email.",
  },
  "pt-BR": {
    lang: "pt-BR",
    saving: "Obrigado pela resposta",
    savingSub: "Salvando agora…",
    confirm: "Confirmar",
    thanks: "Obrigado! Quer contar mais alguma coisa? (opcional)",
    send: "Enviar",
    placeholder: "Sua mensagem",
    done: "Obrigado, recebemos.",
    expired: "Este link expirou",
    expiredSub: "Nada foi salvo. Obrigado por abrir mesmo assim.",
    invalid: "Este link não funciona",
    labels: { good: "Bom", ok: "Mais ou menos", bad: "Ruim" },
    home: "Ir para o Receebo",
    privacyNote: "Se você avaliou sua experiência com o Receebo, guardamos essa avaliação de forma anônima depois que sua conta é excluída, sem nenhum vínculo com você ou seu e-mail.",
  },
} as const;

export function pageCopy(locale: EmailLocale) {
  return PAGE_COPY[locale];
}

const STYLE = `
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;margin:0;}
  main{max-width:440px;margin:0 auto;padding:48px 24px;text-align:center;}
  .eyebrow{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 28px;}
  h1{font-size:22px;font-weight:800;line-height:1.25;margin:0 0 8px;}
  p{color:#444;font-size:15px;line-height:1.6;margin:0 0 20px;}
  .smiles{display:flex;justify-content:center;gap:12px;margin:24px 0;}
  .smile{font-size:36px;line-height:1;background:#fff;border:2px solid #E6E6E6;border-radius:999px;width:64px;height:64px;cursor:pointer;opacity:.45;}
  .smile.on{border-color:#111;opacity:1;}
  .btn{display:inline-block;background:#111;color:#fff;border:0;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;cursor:pointer;}
  textarea{width:100%;box-sizing:border-box;min-height:120px;border:1px solid #D4D4D4;border-radius:12px;padding:12px;font:inherit;font-size:15px;margin:0 0 16px;resize:vertical;}
  .muted{color:#737373;font-size:13px;}
  a{color:#444;}
`;

function layout(locale: EmailLocale, title: string, body: string, script?: { nonce: string; code: string }): string {
  const c = PAGE_COPY[locale];
  return `<!DOCTYPE html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Receebo</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <p class="eyebrow">Receebo</p>
  ${body}
</main>${script ? `\n<script nonce="${script.nonce}">${script.code}</script>` : ""}
</body>
</html>`;
}

/** GET: nothing is written. The chosen smile is highlighted and POSTed by JS after ~300 ms; <noscript> keeps a button. */
export function renderRatingConfirmPage(input: { locale: EmailLocale; token: string; rating: FeedbackRating; nonce: string }): string {
  const c = PAGE_COPY[input.locale];
  const buttons = FEEDBACK_RATINGS.map((v) =>
    `<button type="submit" name="v" value="${v}" class="smile${v === input.rating ? " on" : ""}" aria-label="${escapeHtml(c.labels[v])}" aria-pressed="${v === input.rating}">${SMILES[v]}</button>`,
  ).join("");
  const body = `<h1>${escapeHtml(c.saving)}</h1>
  <p id="status">${escapeHtml(c.savingSub)}</p>
  <form id="rate" method="post" action="/api/feedback">
    <input type="hidden" name="token" value="${escapeHtml(input.token)}">
    <input type="hidden" name="auto" value="${input.rating}">
    <div class="smiles">${buttons}</div>
    <noscript><button type="submit" name="v" value="${input.rating}" class="btn">${escapeHtml(c.confirm)}</button></noscript>
  </form>`;
  const code = `setTimeout(function(){var f=document.getElementById("rate");if(!f)return;var i=document.createElement("input");i.type="hidden";i.name="v";i.value=${JSON.stringify(input.rating)};f.appendChild(i);f.submit();},300);`;
  return layout(input.locale, c.saving, body, { nonce: input.nonce, code });
}

/** After the POST: optional comment. */
export function renderRatingThanksPage(input: { locale: EmailLocale; token: string; rating: FeedbackRating }): string {
  const c = PAGE_COPY[input.locale];
  const body = `<div class="smiles"><span class="smile on" style="display:inline-flex;align-items:center;justify-content:center;" aria-label="${escapeHtml(c.labels[input.rating])}">${SMILES[input.rating]}</span></div>
  <h1>${escapeHtml(c.thanks)}</h1>
  <form method="post" action="/api/feedback/comment">
    <input type="hidden" name="token" value="${escapeHtml(input.token)}">
    <label for="comment" style="position:absolute;left:-9999px;">${escapeHtml(c.placeholder)}</label>
    <textarea id="comment" name="comment" maxlength="${FEEDBACK_COMMENT_MAX}" placeholder="${escapeHtml(c.placeholder)}"></textarea>
    <button type="submit" class="btn">${escapeHtml(c.send)}</button>
  </form>
  <p class="muted" style="margin-top:24px;">${escapeHtml(c.privacyNote)}</p>`;
  return layout(input.locale, c.thanks, body);
}

export function renderCommentDonePage(locale: EmailLocale, homeUrl: string): string {
  const c = PAGE_COPY[locale];
  return layout(locale, c.done, `<h1>${escapeHtml(c.done)}</h1>
  <p><a href="${escapeHtml(homeUrl)}">${escapeHtml(c.home)}</a></p>`);
}

export function renderLinkProblemPage(locale: EmailLocale, reason: "expired" | "invalid"): string {
  const c = PAGE_COPY[locale];
  const title = reason === "expired" ? c.expired : c.invalid;
  return layout(locale, title, `<h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(c.expiredSub)}</p>`);
}

/** Rate-limit key part for a token without keeping the token itself in memory keys. */
export function tokenFingerprint(token: unknown): string {
  return createHash("sha256").update(typeof token === "string" ? token : "").digest("base64url").slice(0, 16);
}

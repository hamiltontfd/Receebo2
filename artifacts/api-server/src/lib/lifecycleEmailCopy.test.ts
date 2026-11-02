import { describe, expect, it } from "vitest";
import { renderAccountDeletedEmail, renderDeletionWarningEmail, renderTrialEndedEmail, reportLines } from "./lifecycleEmailCopy";

const deletionDate = new Date("2027-01-04T12:00:00Z");
const full = { receiptsSaved: 12, returnWindowsTracked: 3, warrantiesTracked: 1, alertsSent: 2 };
const empty = { receiptsSaved: 0, returnWindowsTracked: 0, warrantiesTracked: 0, alertsSent: 0 };
const ratingUrls = { good: "https://app/api/feedback/r/T?v=good", ok: "https://app/api/feedback/r/T?v=ok", bad: "https://app/api/feedback/r/T?v=bad" };
const common = { privacyUrl: "https://app/privacy" };
const LOCALES = ["en", "pt-PT", "pt-BR"] as const;

describe("lifecycle email copy (en, pt-PT, pt-BR)", () => {
  it("report block: only lines > 0, pluralised per language; empty sentence when all are 0", () => {
    expect(reportLines(full, "en")).toEqual(["12 receipts saved", "3 return windows tracked", "1 warranty tracked", "2 alerts sent"]);
    expect(reportLines({ ...empty, receiptsSaved: 1 }, "pt-PT")).toEqual(["1 recibo guardado"]);
    expect(reportLines({ ...empty, receiptsSaved: 2 }, "pt-BR")).toEqual(["2 recibos salvos"]);
    const none = renderTrialEndedEmail({ ...common, locale: "pt-PT", report: empty, deletionDate, subscribeUrl: "https://app/s", ratingUrls });
    expect(none.text).toContain("Desta vez não chegou a guardar nenhum recibo");
  });

  it("trial ended: subject with and without name, smiles only with signed links, one button, dates per language", () => {
    const en = renderTrialEndedEmail({ ...common, locale: "en", formatLocale: "en-US", firstName: "Ana", report: full, deletionDate, subscribeUrl: "https://app/s", ratingUrls });
    expect(en.subject).toBe("Thanks for trying Receebo, Ana");
    expect(en.text).toContain("until Jan 4, 2027");
    expect(en.html).toContain("😀");
    expect(en.html.match(/border-radius:999px/g)?.length).toBe(1);
    const noLinks = renderTrialEndedEmail({ ...common, locale: "en", report: full, deletionDate, subscribeUrl: "https://app/s", ratingUrls: null });
    expect(noLinks.subject).toBe("Thanks for trying Receebo");
    expect(noLinks.html).not.toContain("😀");
    const pt = renderTrialEndedEmail({ ...common, locale: "pt-PT", report: full, deletionDate, subscribeUrl: "https://app/s", ratingUrls });
    expect(pt.subject).toBe("Obrigado por experimentar o Receebo");
    expect(pt.text).toContain("até 4/01/2027"); // Replit formatEmailDate: Node ICU renders pt-PT short month as 4/01/2027
    expect(pt.html).toContain('lang="pt-PT"');
    const br = renderTrialEndedEmail({ ...common, locale: "pt-BR", report: full, deletionDate, subscribeUrl: "https://app/s", ratingUrls });
    expect(br.subject).toBe("Obrigado por testar o Receebo");
  });

  it("pt-PT is European Portuguese, never the Brazilian copy", () => {
    for (const stage of ["30d", "7d"] as const) {
      const pt = renderDeletionWarningEmail({ ...common, locale: "pt-PT", stage, report: full, deletionDate, subscribeUrl: "https://app/s", exportUrl: "mailto:contact@receebo.net" });
      expect(pt.text).toMatch(/eliminad|eliminar/);
      expect(pt.text).not.toMatch(/excluí|excluir|assinatura|Equipe|você/i);
      expect(pt.text).toContain("A equipa Receebo");
    }
    const deleted = renderAccountDeletedEmail({ ...common, locale: "pt-PT", reason: "inactive", deletedReceiptsCount: 3, signupUrl: "https://receebo.net/" });
    expect(deleted.text).toContain("Como avisámos, eliminámos a sua conta do Receebo e os seus 3 recibos.");
  });

  it("deletion warnings: copies by email (no in-app export while paused), always shown; account deleted without count", () => {
    for (const locale of LOCALES) {
      const w = renderDeletionWarningEmail({ ...common, locale, stage: "7d", report: empty, deletionDate, subscribeUrl: "https://app/s", exportUrl: "mailto:contact@receebo.net?subject=x" });
      expect(w.html).toContain("mailto:contact@receebo.net");
      expect(w.html).not.toMatch(/download|baixar|baixe/i);
      const d = renderAccountDeletedEmail({ ...common, locale, reason: "requested", deletedReceiptsCount: 0, signupUrl: "https://receebo.net/" });
      expect(d.text).not.toMatch(/\d+ (receipts|recibos)/);
    }
  });

  it("never: 'while you're subscribed', a dollar price, Gmail or EU hosting", () => {
    for (const locale of LOCALES) {
      const all = [
        renderTrialEndedEmail({ ...common, locale, report: full, deletionDate, subscribeUrl: "https://app/s", ratingUrls }),
        renderDeletionWarningEmail({ ...common, locale, stage: "30d", report: full, deletionDate, subscribeUrl: "https://app/s", exportUrl: "mailto:c" }),
        renderAccountDeletedEmail({ ...common, locale, reason: "inactive", deletedReceiptsCount: 1, signupUrl: "https://receebo.net/" }),
      ].map((e) => `${e.subject} ${e.html} ${e.text}`).join(" ");
      expect(all).not.toMatch(/while you.re subscribed|\$\d|gmail|EU hosting|hospedagem/i);
    }
  });
});

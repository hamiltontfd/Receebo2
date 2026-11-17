import { useEffect, useState } from "react";
import { Link } from "wouter";
import { cookieText } from "@/lib/cookieCopy";
import {
  acceptAll, consentCookie, CONSENT_STORAGE_KEY, effectiveConsent, emptyConsent,
  parseConsent, CONSENT_CHANGED, type ConsentRegion, type ConsentState,
} from "@/lib/adConsent";
import { applyConsentPrivacy } from "@/lib/metaPixel";

export const OPEN_COOKIE_SETTINGS = "receebo:open-cookie-settings";
export const OPT_OUT_SHARING = "receebo:opt-out-sharing";

export function SharingOptOutButton() {
  return <button type="button" className="text-left text-muted-foreground hover:text-foreground"
    onClick={() => window.dispatchEvent(new Event(OPT_OUT_SHARING))}>
    {cookieText("doNotSell", "en")}
  </button>;
}

function readStored(): ConsentState | null {
  try { return parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)); }
  catch { return null; }
}

function writeStored(state: ConsentState) {
  try { localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  document.cookie = consentCookie(state);
  applyConsentPrivacy(state);
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}

export function globalPrivacyControl(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function CookieConsent({ region }: { region: ConsentRegion }) {
  const [stored, setStored] = useState<ConsentState | null>(null);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(emptyConsent());
  const [optOutConfirmed, setOptOutConfirmed] = useState(false);
  const gpc = globalPrivacyControl();

  useEffect(() => {
    const saved = readStored();
    setStored(saved);
    setOpen(!saved?.choice);
    const show = () => {
      setDraft(readStored() ?? effectiveConsent(null, region, gpc));
      setPrefs(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS, show);
    const optOut = () => {
      const state: ConsentState = {
        ...(readStored() ?? emptyConsent()), marketing: false, attribution: false,
        choice: "preferences", updatedAt: new Date().toISOString(),
      };
      writeStored(state);
      setStored(state);
      setOpen(false);
      setPrefs(false);
      setOptOutConfirmed(true);
    };
    window.addEventListener(OPT_OUT_SHARING, optOut);
    return () => {
      window.removeEventListener(OPEN_COOKIE_SETTINGS, show);
      window.removeEventListener(OPT_OUT_SHARING, optOut);
    };
  }, [region, gpc]);

  const choose = (state: ConsentState) => {
    writeStored(state);
    setStored(state);
    setOpen(false);
    setPrefs(false);
    setOptOutConfirmed(false);
  };

  if (!open) return optOutConfirmed ? <p role="status" className="fixed bottom-4 left-4 right-4 z-[80] rounded-xl border bg-background p-4 text-sm shadow-lg">{cookieText("optOutConfirmed")}</p> : null;
  const active = prefs ? draft : effectiveConsent(stored, region, gpc);
  return (
    <div role="dialog" aria-labelledby="cookie-title" data-testid="cookie-banner" className="fixed inset-x-0 bottom-0 z-[80] border-t bg-background p-4 shadow-lg sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div>
          <h2 id="cookie-title" className="text-base font-bold">{cookieText("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{region === "US" ? cookieText("usLead") : cookieText("euLead")}</p>
          {region === "US" && gpc && <p className="mt-1 text-sm" data-testid="gpc-notice">Your browser&apos;s Global Privacy Control signal is honored.</p>}
        </div>
        {prefs && (
          <fieldset className="space-y-3 text-sm" data-testid="cookie-preferences-panel">
            <Category label={cookieText("essential")} help={cookieText("essentialHelp")} checked disabled />
            <Category label={cookieText("prefs")} help={cookieText("prefsHelp")} checked={active.preferences} onChange={(preferences) => setDraft({ ...active, preferences, choice: "preferences" })} />
            <Category label={cookieText("attribution")} help={cookieText("attributionHelp")} checked={active.attribution} onChange={(attribution) => setDraft({ ...active, attribution, choice: "preferences" })} />
            <Category label={cookieText("marketing")} help={cookieText("marketingHelp")} checked={active.marketing} onChange={(marketing) => setDraft({ ...active, marketing, choice: "preferences" })} />
          </fieldset>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="cookie-accept" className="min-h-11 rounded-full bg-[#121212] px-4 text-sm font-semibold text-white" onClick={() => choose(acceptAll())}>{cookieText("accept")}</button>
          <button type="button" data-testid="cookie-reject" className="min-h-11 rounded-full border px-4 text-sm font-semibold" onClick={() => choose(emptyConsent())}>{cookieText("reject")}</button>
          {prefs
            ? <button type="button" data-testid="cookie-save" className="min-h-11 rounded-full border px-4 text-sm font-semibold" onClick={() => choose({ ...draft, essential: true, choice: "preferences", updatedAt: new Date().toISOString() })}>{cookieText("save")}</button>
            : <button type="button" data-testid="cookie-preferences" className="min-h-11 rounded-full border px-4 text-sm font-semibold" onClick={() => { setDraft(active); setPrefs(true); }}>{cookieText("preferences")}</button>}
          <Link href="/cookies" className="inline-flex min-h-11 items-center text-sm underline">{cookieText("cookiePolicy")}</Link>
        </div>
      </div>
    </div>
  );
}

function Category({ label, help, checked, disabled, onChange }: {
  label: string; help: string; checked: boolean; disabled?: boolean; onChange?: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
      <span><span className="font-semibold">{label}</span> — {help}</span>
    </label>
  );
}

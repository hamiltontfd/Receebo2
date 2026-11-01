import { useAppLocale, type AppLocale } from "@/lib/locale";
import { appText } from "@/lib/appCopy";
import "./BrandLoading.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}logo-mark.svg`;

const SLOGAN: Record<AppLocale, string> = {
  en: "Receipts. Easy to find.",
  "pt-PT": "Recibos. Fáceis de encontrar.",
  "pt-BR": "Recibos. Fáceis de encontrar.",
};

export function BrandLoading() {
  const locale = useAppLocale();
  return (
    <div className="brand-loading" data-testid="status-brand-loading">
      <div className="brand-loading__stack">
        <img
          src={LOGO_SRC}
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className="brand-loading__mark"
          draggable={false}
        />
        <div>
          <p className="brand-loading__name">Receebo</p>
          <p className="brand-loading__slogan">{SLOGAN[locale]}</p>
        </div>
        <div className="brand-loading__bar" aria-hidden="true" />
        <span role="status" aria-live="polite" className="sr-only">
          {appText("Loading…", [], locale)}
        </span>
      </div>
    </div>
  );
}

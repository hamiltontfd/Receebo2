import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { lt } from "@/lib/landingLocale";
import { MarketContext } from "@/components/MarketProvider";

/** v4 capture batches. Each batch has its own stores, currency and rules. */
export type MediaMarket = "eu" | "us" | "br";
export const MEDIA_VERSION = "v4";

// Versioned public App Storage objects. No capture tooling or auth fixtures ship
// with the website; only exported images and silent screen recordings.
export const marketingMedia = (file: string, market: MediaMarket = "eu") =>
  `${import.meta.env.BASE_URL}api/storage/public-objects/marketing/receebo-real-app/${MEDIA_VERSION}/${market}/${file}`;

/**
 * Landing-only override. /us wraps its sections in "us"; tests may pin any batch.
 * Without it, the root landing uses BR captures for the BR market and EU otherwise.
 * Never derived from browser language.
 */
const LandingMediaContext = createContext<MediaMarket | null>(null);
export function LandingMediaProvider({ market, children }: { market: MediaMarket; children: ReactNode }) {
  return <LandingMediaContext.Provider value={market}>{children}</LandingMediaContext.Provider>;
}

/** Safe without any provider (build-time snapshot): defaults to "eu". */
export function useMediaMarket(): MediaMarket {
  const pinned = useContext(LandingMediaContext);
  const market = useContext(MarketContext);
  if (pinned) return pinned;
  return market?.market === "BR" ? "br" : "eu";
}

const PROTECTION: Record<MediaMarket, [number, number]> = {
  eu: [1070, 2190],
  us: [1070, 1916],
  br: [1070, 2010],
};

export function mediaDimensions(file: string, market: MediaMarket): [number, number] {
  switch (file) {
    case "capture-poster.webp":
    case "find-poster.webp":
    case "protect-poster.webp":
      return [960, 640];
    case "protection.webp":
      return PROTECTION[market];
    case "show-to-store.webp":
    case "library-phone.webp":
    case "receipt-phone.webp":
      return [780, 1688];
    default:
      return [1200, 900];
  }
}

/** Portrait phone captures: always shown whole (object-contain), never cropped. */
export const isTallCapture = (file: string) => file === "protection.webp" || file === "show-to-store.webp";

export function AppCapture({
  file, alt, className, caption,
}: {
  file: string;
  alt: string;
  className?: string;
  caption?: string;
}) {
  const market = useMediaMarket();
  const [width, height] = mediaDimensions(file, market);
  const tall = isTallCapture(file);
  return (
    <figure
      data-marketing-capture
      data-capture-shape={tall ? "tall" : "wide"}
      className={cn("rounded-2xl border border-border bg-gradient-to-br from-blue-50/70 to-violet-50/70 p-6 sm:p-8 flex min-w-0 flex-col justify-center items-center gap-5 overflow-hidden", className)}
    >
      <img
        src={marketingMedia(file, market)}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className={cn(
          "block min-h-0 object-contain rounded-xl shadow-sm border border-border/60 bg-white p-4 sm:p-5",
          // Tall: full width on phones, phone-centred and capped on desktop so text stays legible.
          tall ? "w-full h-auto max-h-[78svh] md:w-auto md:max-w-full md:max-h-[min(72vh,820px)] mx-auto" : "w-full",
        )}
      />
      <figcaption className="text-center text-[11px] text-muted-foreground leading-relaxed shrink-0">
        {caption ?? lt("Real Receebo screen · fictional sample data", "Ecrã real do Receebo · dados de exemplo fictícios", "Tela real do Receebo · dados de exemplo fictícios")}
      </figcaption>
    </figure>
  );
}

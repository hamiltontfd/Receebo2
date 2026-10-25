import { cn } from "@/lib/utils";

// Versioned public App Storage objects. No capture tooling or auth fixtures ship
// with the website; only exported images and silent screen recordings.
export const marketingMedia = (file: string) =>
  `${import.meta.env.BASE_URL}api/storage/public-objects/marketing/receebo-real-app/v1/${file}`;

const dimensions: Record<string, [number, number]> = {
  "capture-poster.webp": [960, 640],
  "find-poster.webp": [960, 640],
  "protection.webp": [686, 312],
  "original-receipt.webp": [686, 1152],
  "email-settings.webp": [1248, 224],
};

export function AppCapture({
  file, alt, className, caption = "Real Receebo screen · fictional sample data",
}: {
  file: string;
  alt: string;
  className?: string;
  caption?: string;
}) {
  const [width, height] = dimensions[file] ?? [1200, 900];
  return (
    <figure className={cn("rounded-2xl border border-border bg-gradient-to-br from-blue-50/70 to-violet-50/70 p-5 flex flex-col justify-center gap-4 overflow-hidden", className)}>
      <img
        src={marketingMedia(file)}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="w-full min-h-0 object-contain rounded-xl shadow-sm border border-border/60 bg-white"
      />
      <figcaption className="text-center text-[11px] text-muted-foreground leading-relaxed shrink-0">
        {caption}
      </figcaption>
    </figure>
  );
}

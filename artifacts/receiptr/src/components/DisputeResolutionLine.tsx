import { Link } from "wouter";

/**
 * Footer line pointing to the alternative dispute-resolution body (TRIAVE).
 * The site is English-only today; pass locale="pt" where Portuguese is shown.
 */
export default function DisputeResolutionLine({
  locale = "en",
  className,
}: {
  locale?: "en" | "pt";
  className?: string;
}) {
  return (
    <p className={className} data-testid="text-dispute-resolution">
      {locale === "pt" ? (
        <>
          Resolução alternativa de litígios: TRIAVE, ver{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Termos
          </Link>
        </>
      ) : (
        <>
          Alternative dispute resolution: TRIAVE (see{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms
          </Link>
          )
        </>
      )}
    </p>
  );
}

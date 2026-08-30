import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

interface LegalPageLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function LegalPageLayout({
  title,
  description,
  children,
}: LegalPageLayoutProps) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = descriptionTag?.content;

    document.title = `${title} — Receebo`;
    if (descriptionTag) descriptionTag.content = description;

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== undefined) {
        descriptionTag.content = previousDescription;
      }
    };
  }, [title, description]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Receebo" className="h-7 w-auto" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Receebo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <div className="mb-10 border-b pb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Legal
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective 30 August 2026
          </p>
        </div>

        <article className="prose prose-neutral max-w-none prose-headings:scroll-mt-20 prose-headings:font-bold prose-a:text-foreground prose-a:underline prose-a:underline-offset-4">
          {children}
        </article>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Receebo</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
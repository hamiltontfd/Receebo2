import { useCallback, useEffect, useState } from "react";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import { Link } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

interface AcceptanceStatus {
  accepted: boolean;
  termsVersion: string;
  privacyVersion: string;
}

export const LEGAL_ACCEPTED_EVENT = "receebo:legal-accepted";

export function LegalConsentGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AcceptanceStatus | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  usePwaUpdateBlocker((!status?.accepted && confirmed) || submitting);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/legal/acceptance`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load legal status");
      setStatus((await response.json()) as AcceptanceStatus);
    } catch {
      setError("We couldn't verify your legal acceptance. Please try again.");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const accept = async () => {
    if (!status || !confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/legal/acceptance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termsVersion: status.termsVersion,
          privacyVersion: status.privacyVersion,
          confirmedAge: true,
        }),
      });
      if (!response.ok) throw new Error("Acceptance failed");
      setStatus({ ...status, accepted: true });
      window.dispatchEvent(new Event(LEGAL_ACCEPTED_EVENT));
    } catch {
      setError("We couldn't save your acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status?.accepted) return <>{children}</>;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-secondary/20 px-5 py-12">
      <div className="w-full max-w-lg rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Before you continue
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Please review Receebo’s legal terms. Optional inbox access, email
          reminders, and push notifications are controlled separately in
          Settings.
        </p>

        {!status && !error && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {status && (
          <>
            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-foreground"
              />
              <span className="text-sm leading-6">
                I confirm that I am at least 18 years old and agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-semibold underline underline-offset-4"
                >
                  Terms of Service
                </Link>{" "}
                and acknowledge the{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-semibold underline underline-offset-4"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <Button
              className="mt-4 w-full rounded-full"
              disabled={!confirmed || submitting}
              onClick={() => void accept()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Agree and continue"
              )}
            </Button>
          </>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
            {!status && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-full"
                onClick={() => void loadStatus()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
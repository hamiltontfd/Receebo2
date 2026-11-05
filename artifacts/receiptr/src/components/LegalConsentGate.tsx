import { useCallback, useEffect, useState } from "react";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import { Link } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLoading } from "@/components/BrandLoading";
import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const API_BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

interface AcceptanceStatus {
  accepted: boolean;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt?: string | null;
  hadPriorAcceptance?: boolean;
  previouslyConfirmedAge?: boolean;
  deletionRecovery?: boolean;
}

export const LEGAL_ACCEPTED_EVENT = "receebo:legal-accepted";
/** Fired when an API call returns 428 LEGAL_ACCEPTANCE_REQUIRED so the overlay can reopen over the loaded app. */
export const LEGAL_ACCEPTANCE_REQUIRED_EVENT = "receebo:legal-acceptance-required";

type RequiredDetail = {
  termsVersion?: string;
  privacyVersion?: string;
};

export function notifyLegalAcceptanceRequired(detail: RequiredDetail = {}) {
  window.dispatchEvent(
    new CustomEvent(LEGAL_ACCEPTANCE_REQUIRED_EVENT, { detail }),
  );
}

function isReacceptance(status: AcceptanceStatus): boolean {
  if (status.accepted) return false;
  if (status.hadPriorAcceptance === true) return true;
  return status.acceptedAt != null;
}

function canSkipAgeConfirm(status: AcceptanceStatus): boolean {
  if (!isReacceptance(status)) return false;
  // Prior acceptances always required confirmedAge:true on POST.
  if (status.previouslyConfirmedAge === false) return false;
  return true;
}

function ConsentCopy({
  status,
  confirmed,
  setConfirmed,
  submitting,
  error,
  onAccept,
  skipAge,
  reaccept,
}: {
  status: AcceptanceStatus;
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  submitting: boolean;
  error: string | null;
  onAccept: () => void;
  skipAge: boolean;
  reaccept: boolean;
}) {
  useAppLocale();
  return (
    <>
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight" data-testid="legal-consent-title">
        {reaccept ? appText("Updated Privacy Policy") : appText("Before you continue")}
      </h1>
      {reaccept ? (
        <p
          className="mt-2 text-sm leading-6 text-muted-foreground"
          data-testid="legal-policy-updated"
        >
          {appText(
            "We've updated our Privacy Policy. Please review and accept to keep using the app.",
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {appText(
            "Please review Receebo’s legal terms. Optional inbox access, email reminders, and push notifications are controlled separately in Settings.",
          )}
        </p>
      )}

      {reaccept && (
        <p className="mt-4 text-sm leading-6">
          <Link
            href="/privacy"
            target="_blank"
            className="font-semibold underline underline-offset-4"
            data-testid="legal-privacy-link"
          >
            {appText("Review the Privacy Policy")}
          </Link>
        </p>
      )}

      {!skipAge && (
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border p-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-foreground"
            data-testid="legal-age-checkbox"
          />
          <span className="text-sm leading-6">
            {appText("I confirm that I am at least 18 years old and agree to the")}{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold underline underline-offset-4"
            >
              {appText("Terms of Service")}
            </Link>{" "}
            {appText("and acknowledge the")}{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold underline underline-offset-4"
            >
              {appText("Privacy Policy")}
            </Link>
            .
          </span>
        </label>
      )}

      <Button
        className={`w-full rounded-full ${skipAge ? "mt-6" : "mt-4"}`}
        disabled={!confirmed || submitting}
        onClick={() => void onAccept()}
        data-testid="legal-accept-button"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {appText("Saving…")}
          </>
        ) : reaccept ? (
          appText("Accept and continue")
        ) : (
          appText("Agree and continue")
        )}
      </Button>

      {error && (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Keep versions available for tests / debugging without printing secrets. */}
      <span className="sr-only" data-testid="legal-versions">
        {status.termsVersion} {status.privacyVersion}
      </span>
    </>
  );
}

export function LegalConsentGate({ children }: { children: React.ReactNode }) {
  useAppLocale();
  const [status, setStatus] = useState<AcceptanceStatus | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reaccept = status ? isReacceptance(status) : false;
  const skipAge = status ? canSkipAgeConfirm(status) : false;
  usePwaUpdateBlocker((!status?.accepted && confirmed) || submitting);

  useEffect(() => {
    if (skipAge) setConfirmed(true);
  }, [skipAge]);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/legal/acceptance`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load legal status");
      setStatus((await response.json()) as AcceptanceStatus);
    } catch {
      setError(appText("We couldn't verify your legal acceptance. Please try again."));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const detail = (event as CustomEvent<RequiredDetail>).detail ?? {};
      setStatus((prev) => ({
        accepted: false,
        termsVersion: detail.termsVersion ?? prev?.termsVersion ?? "",
        privacyVersion: detail.privacyVersion ?? prev?.privacyVersion ?? "",
        acceptedAt: prev?.acceptedAt ?? new Date(0).toISOString(),
        hadPriorAcceptance: true,
        previouslyConfirmedAge: prev?.previouslyConfirmedAge !== false,
      }));
      setConfirmed(false);
      setError(null);
    };
    window.addEventListener(LEGAL_ACCEPTANCE_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(LEGAL_ACCEPTANCE_REQUIRED_EVENT, onRequired);
  }, []);

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
      setStatus({
        ...status,
        accepted: true,
        hadPriorAcceptance: true,
        previouslyConfirmedAge: true,
      });
      window.dispatchEvent(new Event(LEGAL_ACCEPTED_EVENT));
    } catch {
      setError(appText("We couldn't save your acceptance. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (status?.accepted) return <>{children}</>;
  if (!status && !error) return <BrandLoading />;

  // First-time accounts: keep the full-page gate (no app chrome behind).
  // Re-accept / mid-session 428: render the loaded app under a blocking overlay.
  if (status && reaccept) {
    return (
      <>
        <div
          aria-hidden
          data-testid="legal-consent-app-behind"
          className="pointer-events-none select-none"
        >
          {children}
        </div>
        <AlertDialog open>
          <AlertDialogContent
            className="max-h-[min(90dvh,40rem)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg"
            data-testid="legal-consent-overlay"
          >
            <AlertDialogHeader className="text-left sm:text-left">
              <AlertDialogTitle className="sr-only">
                {appText("Updated Privacy Policy")}
              </AlertDialogTitle>
              <AlertDialogDescription className="sr-only">
                {appText(
                  "We've updated our Privacy Policy. Please review and accept to keep using the app.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ConsentCopy
              status={status}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              submitting={submitting}
              error={error}
              onAccept={accept}
              skipAge={skipAge}
              reaccept
            />
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div
      className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-secondary/20 px-5 py-12"
      data-testid="legal-consent-fullpage"
    >
      <div className="w-full max-w-lg rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        {status ? (
          <ConsentCopy
            status={status}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
            submitting={submitting}
            error={error}
            onAccept={accept}
            skipAge={false}
            reaccept={false}
          />
        ) : (
          <>
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {appText("Before you continue")}
            </h1>
            {error && (
              <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-full"
                  onClick={() => void loadStatus()}
                >
                  {appText("Try again")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

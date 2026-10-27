import { useState } from "react";
import { usePwaUpdateBlocker } from "@/lib/pwa";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useBillingStatus } from "@/hooks/useBilling";
import { FROZEN_EXPORT_NOTE, isFrozenAccount } from "@/lib/accountLifecycle";
import {
  cleanDeletionCodeInput,
  deletionCodeSentMessage,
  isCompleteDeletionCode,
} from "@/lib/accountDeletionCode";

const BASE_PATH = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
const API_BASE = `${BASE_PATH}/api`;

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function PrivacyAndDataSettings() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  // Step 1: warning + type DELETE. Step 2: the 6-digit code from the email.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  usePwaUpdateBlocker(exporting || deleting || dialogOpen);

  const resetDeletionDialog = () => {
    setConfirmation("");
    setCodeSentTo(null);
    setCode("");
    setCodeError(null);
  };

  const requestDeletionCode = async () => {
    if (confirmation !== "DELETE") return;
    setSendingCode(true);
    setCodeError(null);
    try {
      const response = await fetch(`${API_BASE}/account/deletion-code`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "Could not send the code."));
      }
      const body = (await response.json()) as { sentTo?: string };
      setCodeSentTo(body.sentTo ?? "your email");
      setCode("");
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "Could not send the code.");
    } finally {
      setSendingCode(false);
    }
  };
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Self-serve export only while the account has access; frozen accounts ask by email.
  const { data: billing } = useBillingStatus();
  const frozen = isFrozenAccount(billing);

  const downloadExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_BASE}/account/export`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Could not prepare your data export."),
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filename =
        disposition?.match(/filename="([^"]+)"/)?.[1] ??
        "receebo-data-export.json";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Data export downloaded",
        description:
          "Your JSON export contains your account, receipt, email connection, preference, and subscription records.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not prepare your data export.",
      });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (confirmation !== "DELETE" || !isCompleteDeletionCode(code)) return;
    setDeleting(true);
    setCodeError(null);
    try {
      const response = await fetch(`${API_BASE}/account`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation, code }),
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Could not delete your account."),
        );
      }

      queryClient.clear();
      localStorage.removeItem("receebo:guestToken");
      try {
        await signOut({
          redirectUrl: `${window.location.origin}${BASE_PATH || "/"}`,
        });
      } finally {
        window.location.assign(BASE_PATH || "/");
      }
    } catch (error) {
      setDeleting(false);
      setCodeError(error instanceof Error ? error.message : "Could not delete your account.");
      toast({
        variant: "destructive",
        title: "Account was not deleted",
        description:
          error instanceof Error
            ? error.message
            : "Could not delete your account.",
      });
    }
  };

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Privacy and data
      </h2>
      <div className="overflow-hidden rounded-xl border divide-y">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Legal documents</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Review how Receebo handles your data and the terms that apply to
                the service.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/privacy">
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs">
                    Privacy Policy
                    <ExternalLink className="ml-1.5 h-3 w-3" />
                  </Button>
                </Link>
                <Link href="/terms">
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs">
                    Terms of Service
                    <ExternalLink className="ml-1.5 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Download your data</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground" data-testid="text-export-description">
              {frozen
                ? FROZEN_EXPORT_NOTE
                : "Export your account and structured receipt data as a JSON file. Receipt images and attachments remain downloadable from each receipt."}
            </p>
          </div>
          {!frozen && <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full"
            disabled={exporting}
            onClick={() => void downloadExport()}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">
              {exporting ? "Preparing…" : "Download"}
            </span>
          </Button>}
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Permanently remove your Receebo account, receipts, attachments,
              email connections, and notification subscriptions.
            </p>
          </div>
          <AlertDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (!deleting) {
                setDialogOpen(open);
                if (!open) resetDeletionDialog();
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">Delete</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your Receebo account?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    This permanently deletes your receipts, extracted data,
                    uploaded files, email connections, and preferences. Any known
                    active Stripe subscription is cancelled first.
                  </span>
                  <span className="block">
                    Stripe may retain invoice and payment records where required
                    by law. This action does not automatically issue a refund.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              {codeSentTo === null ? (
                <>
                  <label className="text-sm font-medium" htmlFor="delete-confirmation">
                    Type DELETE to confirm
                  </label>
                  <input
                    id="delete-confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    We'll email you a 6-digit code to confirm it's you.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground" data-testid="text-deletion-code-sent">
                    {deletionCodeSentMessage(codeSentTo)}
                  </p>
                  <label className="text-sm font-medium" htmlFor="delete-code">
                    Enter the code
                  </label>
                  <input
                    id="delete-code"
                    value={code}
                    onChange={(event) => setCode(cleanDeletionCodeInput(event.target.value))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="h-10 rounded-md border bg-background px-3 font-mono text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    className="self-start text-xs font-medium underline underline-offset-4 disabled:opacity-50"
                    disabled={sendingCode || deleting}
                    onClick={() => void requestDeletionCode()}
                  >
                    {sendingCode ? "Sending…" : "Send a new code"}
                  </button>
                </>
              )}
              {codeError && (
                <p className="text-sm text-destructive" role="alert" data-testid="text-deletion-error">
                  {codeError}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Keep account</AlertDialogCancel>
                {codeSentTo === null ? (
                  <AlertDialogAction
                    disabled={confirmation !== "DELETE" || sendingCode}
                    onClick={(event) => {
                      event.preventDefault();
                      void requestDeletionCode();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {sendingCode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {sendingCode ? "Sending…" : "Email me a code"}
                  </AlertDialogAction>
                ) : (
                  <AlertDialogAction
                    disabled={!isCompleteDeletionCode(code) || deleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void deleteAccount();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {deleting ? "Deleting…" : "Permanently delete"}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        For another privacy request, email{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href="mailto:contact@receebo.net"
        >
          contact@receebo.net
        </a>
        .
      </p>
    </section>
  );
}
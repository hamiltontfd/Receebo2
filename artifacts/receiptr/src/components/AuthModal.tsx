import type { ReactNode } from "react";
import { ClerkLoaded, ClerkLoading } from "@clerk/react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Dialog, DialogClose, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import Landing from "@/pages/landing";

/** Keep the existing auth URLs (including OAuth steps) over the public homepage. */
export default function AuthModal({ title, children }: { title: string; children: ReactNode }) {
  const [, setLocation] = useLocation();

  const close = () => {
    // Dismissing a trial must not start checkout after an unrelated future login.
    sessionStorage.removeItem("receebo:pendingPlan");
    setLocation("/", { replace: true });
  };

  return (
    <>
      <Landing />
      <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[488px] grid-cols-1 overflow-y-auto rounded-2xl border-0 px-4 pb-6 pt-14 sm:px-6"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogClose asChild>
            <button type="button" className="absolute left-4 top-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to homepage
            </button>
          </DialogClose>
          <ClerkLoading>
            <div role="status" className="flex min-h-40 items-center justify-center" data-testid="auth-loading">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Loading</span>
            </div>
          </ClerkLoading>
          <ClerkLoaded>{children}</ClerkLoaded>
        </DialogContent>
      </Dialog>
    </>
  );
}

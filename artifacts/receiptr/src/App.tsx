import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import ReceiptDetail from "@/pages/receipt-detail";
import Scan from "@/pages/scan";
import SearchPage from "@/pages/search";
import StatsPage from "@/pages/stats";
import WorthKeepingPage from "@/pages/worth-keeping";
import ImportsPage from "@/pages/imports";
import Settings from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import RecurringSuppliersPage from "@/pages/recurring-suppliers";
import GetStarted from "@/pages/get-started";
import PrivacyPolicy from "@/pages/privacy";
import TermsOfService from "@/pages/terms";
import AppShell from "@/components/AppShell";
import AuthModal from "@/components/AuthModal";
import PwaStatus from "@/components/PwaStatus";
import InstallBar from "@/components/InstallBar";
import { PlanSelectionGate } from "@/components/PlanSelectionGate";
import { LEGAL_ACCEPTED_EVENT, LegalConsentGate } from "@/components/LegalConsentGate";
import { useBillingStatus, resolveAccessState } from "@/hooks/useBilling";
import { useGuestMode, clearGuestToken } from "@/components/GuestProvider";
import { setGuestId } from "@workspace/api-client-react";

const GUEST_TOKEN_KEY = "receebo:guestToken";
const apiBase = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(0 0% 7%)",
    colorForeground: "hsl(0 0% 7%)",
    colorMutedForeground: "hsl(0 0% 45%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 90%)",
    colorInputForeground: "hsl(0 0% 7%)",
    colorNeutral: "hsl(0 0% 90%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold tracking-tight text-[#121212]",
    headerSubtitle: "text-sm text-[#737373]",
    socialButtonsBlockButtonText: "text-sm font-medium !text-[#121212]",
    formFieldLabel: "text-sm font-medium text-[#121212]",
    footerActionLink: "text-[#121212] hover:text-black font-medium",
    footerActionText: "text-sm text-[#737373]",
    dividerText: "text-xs text-[#737373]",
    identityPreviewEditButton: "text-[#121212] hover:text-black",
    formFieldSuccessText: "text-sm text-[#121212]",
    alertText: "text-sm",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-8",
    socialButtonsBlockButton: "border-[#c4c4c4] hover:bg-[#f5f5f5] hover:border-[#a3a3a3]",
    formButtonPrimary: "bg-[#121212] hover:bg-black text-white",
    formFieldInput: "bg-[#f5f5f5] border-[#e5e5e5] focus:ring-[#121212]",
    footerAction: "flex gap-2 justify-center mt-6",
    dividerLine: "bg-[#e5e5e5]",
    alert: "bg-[#f5f5f5] text-[#121212]",
    otpCodeFieldInput: "border-[#e5e5e5] focus:ring-[#121212]",
    formFieldRow: "gap-4",
    main: "flex flex-col gap-4",
  },
};

const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to Receebo",
      subtitle: "Welcome back. Please sign in to continue.",
    },
  },
  signUp: {
    start: {
      title: "Create your Receebo account",
      subtitle: "Start organizing every receipt in seconds.",
    },
  },
};

function SignInPage() {
  return (
    <AuthModal title="Sign in to Receebo">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthModal>
  );
}

function SignUpPage() {
  return (
    <AuthModal title="Create your Receebo account">
      <div className="flex min-w-0 w-full max-w-[440px] flex-col items-center gap-4">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        <p className="max-w-sm text-center text-xs leading-5 text-muted-foreground">
          Before using Receebo, you’ll be asked to confirm that you are 18+ and
          agree to the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          . Optional inbox and notification permissions are separate.
        </p>
      </div>
    </AuthModal>
  );
}

function HomeRedirect() {
  const { isGuest } = useGuestMode();
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/search" />
      </Show>
      <Show when="signed-out">
        {isGuest ? <Redirect to="/search" /> : <Landing />}
      </Show>
    </>
  );
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  return (
    <>
      <Show when="signed-in">
        <LegalConsentGate key={userId}>
          <PlanSelectionGate>
            <AppShell>{children}</AppShell>
            <InstallBar />
          </PlanSelectionGate>
        </LegalConsentGate>
      </Show>
      <Show when="signed-out">
        {/* Guest bypass disabled. Accounts get a 15-day, five-receipt trial instead. */}
        <Redirect to="/" />
      </Show>
    </>
  );
}

const PLAN_STORAGE_KEY = "receebo:pendingPlan";

/**
 * Signup never starts checkout. The no-card trial is initialized by
 * PlanSelectionGate after legal consent; paid checkout only happens when the
 * user explicitly picks a plan. Older links may still carry ?plan=, so drop
 * any stale pending-plan marker instead of acting on it.
 */
function PostAuthCheckout() {
  const [location] = useLocation();
  useEffect(() => {
    try {
      sessionStorage.removeItem(PLAN_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [location]);
  return null;
}

function GuestIdSync() {
  const { isGuest, guestUser, exitGuestMode } = useGuestMode();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const claimAttemptedRef = useRef(false);
  const { data: billing } = useBillingStatus();
  // Guest receipts are only migrated once the account has accepted the
  // current legal documents and its trial/billing entitlement exists.
  const billingReady = !!billing && resolveAccessState(billing) !== "not_started";
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setLegalAccepted(false);
      return;
    }
    let cancelled = false;
    const check = () => {
      fetch(`${apiBase}/api/legal/acceptance`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { accepted: false }))
        .then((j: { accepted?: boolean }) => {
          if (!cancelled) setLegalAccepted(j.accepted === true);
        })
        .catch(() => undefined);
    };
    check();
    const onAccepted = () => setLegalAccepted(true);
    window.addEventListener(LEGAL_ACCEPTED_EVENT, onAccepted);
    return () => {
      cancelled = true;
      window.removeEventListener(LEGAL_ACCEPTED_EVENT, onAccepted);
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (isSignedIn) {
      // Signed-in users must never send the guest header
      setGuestId(null);

      // Migrate guest receipts exactly once per sign-in event
      const guestToken = localStorage.getItem(GUEST_TOKEN_KEY);
      if (guestToken && !(legalAccepted && billingReady)) {
        // Wait for consent + trial initialization; keep the token meanwhile.
        return;
      }
      if (guestToken && !claimAttemptedRef.current) {
        claimAttemptedRef.current = true;
        fetch(`${apiBase}/api/guest-session/claim`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestToken }),
        })
          .then((res) => {
            if (res.ok) {
              // Success (204): clear token only now so a failed attempt stays retryable
              clearGuestToken();
              if (isGuest) exitGuestMode();
              // Refetch all active queries so the library immediately shows
              // the migrated receipts under the signed-in user's account
              void queryClient.refetchQueries();
            } else {
              // Server error — keep token in localStorage so the next sign-in
              // cycle can retry; reset guard so retry fires next time
              claimAttemptedRef.current = false;
              if (isGuest) exitGuestMode();
            }
          })
          .catch(() => {
            // Network error — keep token for retry on next sign-in; reset guard
            claimAttemptedRef.current = false;
            if (isGuest) exitGuestMode();
          });
      } else {
        if (isGuest) exitGuestMode();
      }
      return;
    }

    // Signed-out: reset claim guard so a subsequent guest → sign-in round-trip works
    claimAttemptedRef.current = false;
    setGuestId(isGuest ? guestUser?.id ?? null : null);
  }, [isSignedIn, isGuest, guestUser, exitGuestMode, queryClient, legalAccepted, billingReady]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

// Mutations must fail offline, not pause and silently execute on reconnect.
const queryClient = new QueryClient({
  defaultOptions: { mutations: { networkMode: "always", retry: false } },
});

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={clerkLocalization}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <PostAuthCheckout />
          <GuestIdSync />
          <PwaStatus />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
            <Route path="/search/worth-keeping">
              <ProtectedShell><WorthKeepingPage /></ProtectedShell>
            </Route>
            <Route path="/search">
              <ProtectedShell><SearchPage /></ProtectedShell>
            </Route>
            <Route path="/stats">
              <ProtectedShell><StatsPage /></ProtectedShell>
            </Route>
            <Route path="/scan">
              <ProtectedShell><Scan /></ProtectedShell>
            </Route>
            <Route path="/imports">
              <ProtectedShell><ImportsPage /></ProtectedShell>
            </Route>
            <Route path="/receipts/:id">
              <ProtectedShell><ReceiptDetail /></ProtectedShell>
            </Route>
            <Route path="/settings">
              <ProtectedShell><Settings /></ProtectedShell>
            </Route>
            <Route path="/profile/recurring">
              <ProtectedShell><RecurringSuppliersPage /></ProtectedShell>
            </Route>
            <Route path="/profile">
              <ProtectedShell><ProfilePage /></ProtectedShell>
            </Route>
            <Route path="/get-started" component={GetStarted} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Library from "@/pages/library";
import ReceiptDetail from "@/pages/receipt-detail";
import Scan from "@/pages/scan";
import SearchPage from "@/pages/search";
import AppShell from "@/components/AppShell";
import { useGuestMode, clearGuestToken } from "@/components/GuestProvider";
import { setGuestId } from "@workspace/api-client-react";

const GUEST_TOKEN_KEY = "receiptr:guestToken";
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
    socialButtonsBlockButtonText: "text-sm font-medium",
    formFieldLabel: "text-sm font-medium text-[#121212]",
    footerActionLink: "text-[#121212] hover:text-black font-medium",
    footerActionText: "text-sm text-[#737373]",
    dividerText: "text-xs text-[#737373]",
    identityPreviewEditButton: "text-[#121212] hover:text-black",
    formFieldSuccessText: "text-sm text-[#121212]",
    alertText: "text-sm",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-8",
    socialButtonsBlockButton: "border-[#e5e5e5] hover:bg-[#f5f5f5]",
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
      title: "Sign in to Receiptr",
      subtitle: "Welcome back. Please sign in to continue.",
    },
  },
  signUp: {
    start: {
      title: "Create your Receiptr account",
      subtitle: "Start organizing every receipt in seconds.",
    },
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  const { isGuest } = useGuestMode();
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/library" />
      </Show>
      <Show when="signed-out">
        {isGuest ? <Redirect to="/library" /> : <Landing />}
      </Show>
    </>
  );
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { isGuest } = useGuestMode();
  return (
    <>
      <Show when="signed-in">
        <AppShell>{children}</AppShell>
      </Show>
      <Show when="signed-out">
        {isGuest ? <AppShell>{children}</AppShell> : <Redirect to="/" />}
      </Show>
    </>
  );
}

function GuestIdSync() {
  const { isGuest, guestUser, exitGuestMode } = useGuestMode();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const claimAttemptedRef = useRef(false);

  useEffect(() => {
    if (isSignedIn) {
      // Signed-in users must never send the guest header
      setGuestId(null);

      // Migrate guest receipts exactly once per sign-in event
      const guestToken = localStorage.getItem(GUEST_TOKEN_KEY);
      if (guestToken && !claimAttemptedRef.current) {
        claimAttemptedRef.current = true;
        fetch(`${apiBase}/api/guest-session/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestToken }),
        })
          .catch(() => {
            // Silent failure — the user loses their guest receipts in a worst-case
            // scenario, but we never block the sign-in flow
          })
          .finally(() => {
            clearGuestToken();
            if (isGuest) exitGuestMode();
            // Refetch all active queries so the library immediately shows
            // the migrated receipts under the signed-in user's account
            void queryClient.refetchQueries();
          });
      } else {
        if (isGuest) exitGuestMode();
      }
      return;
    }

    // Signed-out: reset claim guard so a subsequent guest → sign-in round-trip works
    claimAttemptedRef.current = false;
    setGuestId(isGuest ? guestUser?.id ?? null : null);
  }, [isSignedIn, isGuest, guestUser, exitGuestMode, queryClient]);

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

const queryClient = new QueryClient();

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
          <GuestIdSync />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/library">
              <ProtectedShell><Library /></ProtectedShell>
            </Route>
            <Route path="/search">
              <ProtectedShell><SearchPage /></ProtectedShell>
            </Route>
            <Route path="/scan">
              <ProtectedShell><Scan /></ProtectedShell>
            </Route>
            <Route path="/receipts/:id">
              <ProtectedShell><ReceiptDetail /></ProtectedShell>
            </Route>
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
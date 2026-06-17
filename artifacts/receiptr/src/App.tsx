import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
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
import { useGuestMode } from "@/components/GuestProvider";
import { setGuestId } from "@workspace/api-client-react";

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
    colorPrimary: "hsl(148 27% 24%)",
    colorForeground: "hsl(154 28% 14%)",
    colorMutedForeground: "hsl(82 8% 41%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(48 15% 88%)",
    colorInputForeground: "hsl(154 28% 14%)",
    colorNeutral: "hsl(48 15% 88%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold tracking-tight text-[#1a2e25]",
    headerSubtitle: "text-sm text-[#616e68]",
    socialButtonsBlockButtonText: "text-sm font-medium",
    formFieldLabel: "text-sm font-medium text-[#1a2e25]",
    footerActionLink: "text-[#2c4c3b] hover:text-[#1a2e25] font-medium",
    footerActionText: "text-sm text-[#616e68]",
    dividerText: "text-xs text-[#616e68]",
    identityPreviewEditButton: "text-[#2c4c3b] hover:text-[#1a2e25]",
    formFieldSuccessText: "text-sm text-[#2c4c3b]",
    alertText: "text-sm",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-8",
    socialButtonsBlockButton: "border-[#e0dfd9] hover:bg-[#f0efea]",
    formButtonPrimary: "bg-[#2c4c3b] hover:bg-[#1a2e25] text-white",
    formFieldInput: "bg-[#f0efea] border-[#e0dfd9] focus:ring-[#2c4c3b]",
    footerAction: "flex gap-2 justify-center mt-6",
    dividerLine: "bg-[#e0dfd9]",
    alert: "bg-[#f0efea] text-[#1a2e25]",
    otpCodeFieldInput: "border-[#e0dfd9] focus:ring-[#2c4c3b]",
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

function LibraryRoute() {
  const { isGuest } = useGuestMode();
  return (
    <>
      <Show when="signed-in">
        <Library />
      </Show>
      <Show when="signed-out">
        {isGuest ? <Library /> : <Redirect to="/" />}
      </Show>
    </>
  );
}

function ReceiptDetailRoute() {
  const { isGuest } = useGuestMode();
  return (
    <>
      <Show when="signed-in">
        <ReceiptDetail />
      </Show>
      <Show when="signed-out">
        {isGuest ? <ReceiptDetail /> : <Redirect to="/" />}
      </Show>
    </>
  );
}

function GuestIdSync() {
  const { isGuest, guestUser } = useGuestMode();
  useEffect(() => {
    setGuestId(isGuest ? guestUser?.id ?? null : null);
  }, [isGuest, guestUser]);
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
            <Route path="/library" component={LibraryRoute} />
            <Route path="/receipts/:id" component={ReceiptDetailRoute} />
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
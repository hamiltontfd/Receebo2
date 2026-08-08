import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  getSubscriptionStatus,
  createCheckoutSession,
  createPortalSession,
  type SubscriptionStatus,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

/**
 * Returns true when the user just came back from Stripe Checkout (the
 * ?checkout=success param is still present in the URL).  We use this to
 * poll billing status until the webhook propagates.
 */
function isCheckoutSuccess() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("checkout") === "success";
}

export function useBillingStatus() {
  const { isSignedIn } = useAuth();
  const afterCheckout = isCheckoutSuccess();

  return useQuery<SubscriptionStatus>({
    queryKey: ["billing", "subscription"],
    queryFn: () => getSubscriptionStatus(base),
    enabled: !!isSignedIn,
    // After checkout, poll every 2 s until the plan becomes non-free so the
    // gate doesn't flash the plan picker while the webhook is in-flight.
    staleTime: afterCheckout ? 0 : 5 * 60 * 1000,
    refetchInterval: afterCheckout
      ? (query) => {
          const data = query.state.data as SubscriptionStatus | undefined;
          return data && data.plan !== "free" ? false : 2000;
        }
      : false,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (planType: "monthly" | "yearly") => createCheckoutSession(base, planType),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Couldn't start checkout",
        description: "Something went wrong on our side. Please try again in a moment.",
      });
    },
  });
}

export function useCreatePortal() {
  return useMutation({
    mutationFn: () => createPortalSession(base),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
  });
}

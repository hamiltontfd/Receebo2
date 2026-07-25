import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  getSubscriptionStatus,
  createCheckoutSession,
  createPortalSession,
  type SubscriptionStatus,
} from "@workspace/api-client-react";

const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

export function useBillingStatus() {
  const { isSignedIn } = useAuth();

  return useQuery<SubscriptionStatus>({
    queryKey: ["billing", "subscription"],
    queryFn: () => getSubscriptionStatus(base),
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (planType: "monthly" | "yearly") => createCheckoutSession(base, planType),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
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

import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billing: {} as Record<string, unknown>, portal: vi.fn(), toast: vi.fn(),
}));
vi.mock("@clerk/react", () => ({ useUser: () => ({ user: null }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/settings", vi.fn()] }));
vi.mock("@/hooks/useBilling", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/useBilling")>(),
  useBillingStatus: () => ({ data: mocks.billing, isLoading: false }),
  useCreatePortal: () => ({ mutate: mocks.portal, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/PushNotificationSettings", () => ({ PushNotificationSettings: () => null }));
vi.mock("@/components/PrivacyAndDataSettings", () => ({ PrivacyAndDataSettings: () => null }));
import Settings from "./settings";

function showSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Settings /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.billing = {
    plan: "pro", accessState: "paid", canUseApp: true, paymentAttention: true,
    currentPeriodEnd: "2030-01-01T00:00:00Z", hasBillingAccount: true,
  };
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => url.includes("gmail") ? { configured: false, connected: false } : { optOut: false },
  })));
});
afterEach(() => vi.unstubAllGlobals());

describe("Settings payment attention", () => {
  it("explains the existing grace period and opens the authenticated billing portal", () => {
    showSettings();
    expect(screen.getByRole("alert")).toHaveTextContent("Your Pro access continues until");
    fireEvent.click(screen.getByRole("button", { name: "Update payment details" }));
    expect(mocks.portal).toHaveBeenCalledTimes(1);
  });
  it("keeps the portal action available after access expiry", () => {
    mocks.billing = { ...mocks.billing, plan: "free", accessState: "subscription_required", canUseApp: false };
    showSettings();
    expect(screen.getByRole("alert")).toHaveTextContent("Your Pro access has ended");
    expect(screen.getByRole("button", { name: "Update payment details" })).toBeEnabled();
  });
  it("shows a useful error if the billing portal cannot open", () => {
    mocks.portal.mockImplementation((_input, options) => options.onError());
    showSettings();
    fireEvent.click(screen.getByRole("button", { name: "Update payment details" }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: "Could not open the billing portal. Please try again.",
    }));
  });
  it("removes the warning and payment action after recovery", () => {
    mocks.billing.paymentAttention = false;
    showSettings();
    expect(screen.queryByTestId("payment-attention")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeEnabled();
  });
  it("does not warn no-card account-trial users", () => {
    mocks.billing = { plan: "trialing", accessState: "account_trial", canUseApp: true, paymentAttention: false };
    showSettings();
    expect(screen.queryByTestId("payment-attention")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update payment details" })).not.toBeInTheDocument();
  });
  it("does not tell complimentary Owners that their access will expire", () => {
    mocks.billing = { ...mocks.billing, ownerAccess: true, accessState: "owner" };
    showSettings();
    expect(screen.getByRole("alert")).toHaveTextContent("Your Owner access is unchanged");
  });
});

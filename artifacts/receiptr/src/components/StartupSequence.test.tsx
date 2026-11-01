import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccountLocale } from "@/lib/locale";

const state = vi.hoisted(() => ({
  authLoaded: false,
  billing: undefined as Record<string, unknown> | undefined,
  loading: true,
  billingError: false,
  trialError: false,
  startTrial: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: state.authLoaded, isSignedIn: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("@/hooks/useBilling", async () => ({
  ...await vi.importActual<typeof import("@/hooks/useBilling")>("@/hooks/useBilling"),
  useBillingStatus: () => ({
    data: state.billing, isLoading: state.loading, isError: state.billingError,
    isFetching: false, refetch: state.refetch,
  }),
  useStartTrial: () => ({ mutate: state.startTrial, isError: state.trialError, isPending: false }),
  useCreateCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useTrialExpiryTimer: () => undefined,
}));
vi.mock("@/lib/trialFunnel", () => ({ trackTrialInteraction: vi.fn() }));

import { AuthStartupGate } from "./AuthStartupGate";
import { LegalConsentGate } from "./LegalConsentGate";
import { PlanSelectionGate } from "./PlanSelectionGate";
import OfflineStartup from "./OfflineStartup";

function Sequence() {
  return (
    <AuthStartupGate>
      <LegalConsentGate>
        <PlanSelectionGate><input aria-label="Private draft" defaultValue="Receipt" /></PlanSelectionGate>
      </LegalConsentGate>
    </AuthStartupGate>
  );
}

const legalResponse = (accepted: boolean) => new Response(JSON.stringify({
  accepted, termsVersion: "current-terms", privacyVersion: "current-privacy",
}), { status: 200 });

function expectBrand() {
  expect(screen.getAllByTestId("status-brand-loading")).toHaveLength(1);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByText("Receebo")).toBeInTheDocument();
  expect(screen.queryByLabelText("Private draft")).not.toBeInTheDocument();
  expect(document.querySelector(".animate-pulse")).toBeNull();
}

beforeEach(() => {
  state.authLoaded = false;
  state.billing = undefined;
  state.loading = true;
  state.billingError = false;
  state.trialError = false;
  state.startTrial.mockReset();
  state.refetch.mockReset();
  setAccountLocale("en");
});
afterEach(() => {
  setAccountLocale(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("initial startup sequence", () => {
  it.each(["en", "pt-PT", "pt-BR"] as const)("keeps the %s brand through auth, legal, plan and trial waits", async (locale) => {
    setAccountLocale(locale);
    let resolveLegal!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { resolveLegal = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<Sequence />);
    expectBrand();
    const slogan = locale === "en" ? "Receipts. Easy to find." : "Recibos. Fáceis de encontrar.";
    expect(screen.getByText(slogan)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    state.authLoaded = true;
    rerender(<Sequence />);
    expectBrand();
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => resolveLegal(legalResponse(true)));
    expectBrand();
    expect(screen.getByText(slogan)).toBeInTheDocument();
    expect(state.startTrial).not.toHaveBeenCalled();

    state.billing = { plan: "free", accessState: "not_started", canUseApp: false };
    state.loading = false;
    rerender(<Sequence />);
    expectBrand();
    expect(state.startTrial).toHaveBeenCalledOnce();
    rerender(<Sequence />);
    expect(state.startTrial).toHaveBeenCalledOnce();

    state.billing = { plan: "free", accessState: "account_trial", canUseApp: true };
    rerender(<Sequence />);
    const draft = screen.getByLabelText("Private draft");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(draft, { target: { value: "Unsaved receipt" } });
    // A failed background refresh retains the last known entitlement and draft.
    state.billingError = true;
    rerender(<Sequence />);
    expect(screen.getByLabelText("Private draft")).toBe(draft);
    expect(draft).toHaveValue("Unsaved receipt");
  });

  it("opens without any minimum display timer when responses are fast", async () => {
    state.authLoaded = true;
    state.loading = false;
    state.billing = { plan: "pro", accessState: "paid", canUseApp: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(legalResponse(true)));
    // No timer advancement: the legal response alone must release the gate.
    vi.useFakeTimers();
    try {
      render(<Sequence />);
      await act(async () => {});
      expect(screen.getByLabelText("Private draft")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces the brand with real consent and does not start the trial before acceptance", async () => {
    state.authLoaded = true;
    state.loading = false;
    state.billing = { plan: "free", accessState: "not_started", canUseApp: false };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(legalResponse(false))
      .mockResolvedValueOnce(new Response(null, { status: 201 })));
    render(<Sequence />);
    expect(await screen.findByText("Before you continue")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(state.startTrial).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Agree and continue" })));
    expectBrand();
    expect(state.startTrial).toHaveBeenCalledOnce();
  });

  it("shows retryable legal and billing errors instead of hiding them with the brand", async () => {
    state.authLoaded = true;
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(legalResponse(true));
    vi.stubGlobal("fetch", fetchMock);
    render(<Sequence />);
    expect(await screen.findByText("We couldn't verify your legal acceptance. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    state.loading = false;
    state.billingError = true;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByTestId("status-billing-error")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Private draft")).not.toBeInTheDocument();
  });

  it("replaces trial loading with a retryable error or explicit plan choice", async () => {
    state.authLoaded = true;
    state.loading = false;
    state.billing = { plan: "free", accessState: "not_started", canUseApp: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(legalResponse(true)));
    const { rerender } = render(<Sequence />);
    await act(async () => {});
    expectBrand();
    state.trialError = true;
    rerender(<Sequence />);
    expect(screen.getByText("We couldn't start your trial.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    state.billing = { plan: "free", accessState: "subscription_required", canUseApp: false };
    rerender(<Sequence />);
    expect(screen.getByTestId("screen-paywall")).toBeInTheDocument();
    expect(screen.queryByLabelText("Private draft")).not.toBeInTheDocument();
  });

  it("leaves offline startup information and retry visible", () => {
    render(<OfflineStartup />);
    expect(screen.getByText("Receebo is offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

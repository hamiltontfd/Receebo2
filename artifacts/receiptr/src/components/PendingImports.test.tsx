import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), navigate: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("@/components/MailConnections", () => ({ useMailStatus: () => ({ data: undefined }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/search", mocks.navigate],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import PendingImports from "./PendingImports";
import { BILLING_QUERY_KEY } from "@/hooks/useBilling";
import { TRIAL_CAP_MESSAGE } from "@/lib/trialCopy";

const item = {
  id: 7, provider: "outlook", gmailMessageId: "m1", originalFileName: "r.pdf", merchant: "Worten",
  total: 19.99, currency: "EUR", purchaseDate: "2026-10-20", category: null, summary: null,
  createdAt: new Date().toISOString(),
};

function mount(billing: Record<string, unknown>, approveResponse: { ok: boolean; status: number; body: unknown }) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/approve") && init?.method === "POST") {
      return { ok: approveResponse.ok, status: approveResponse.status, json: async () => approveResponse.body };
    }
    return { ok: true, status: 200, json: async () => [item] };
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(BILLING_QUERY_KEY, billing);
  render(<QueryClientProvider client={client}><PendingImports /></QueryClientProvider>);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); mocks.toast.mockReset(); });

describe("PendingImports at the free-trial cap", () => {
  it("shows the cap notice with Subscribe and disables approving a 6th receipt", async () => {
    const fetchMock = mount(
      { plan: "free", accessState: "trial_exhausted", canUseApp: true, canUpload: false, trialUploadsUsed: 5 },
      { ok: true, status: 200, body: { approved: true, receiptId: 1 } },
    );
    expect(await screen.findByTestId("pending-trial-cap")).toHaveTextContent(TRIAL_CAP_MESSAGE);
    expect(screen.getByTestId("link-pending-subscribe")).toHaveTextContent("Subscribe");
    expect(screen.getByTestId("link-pending-subscribe").getAttribute("href")).toBe("/settings#upgrade-plans");
    const approve = screen.getByTitle(TRIAL_CAP_MESSAGE);
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/approve"), expect.anything());
  });

  it("shows the cap message with a Subscribe action when the server refuses the approval", async () => {
    mount(
      { plan: "trialing", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 1 },
      { ok: false, status: 403, body: { error: "subscription_required", code: "trial_exhausted", message: TRIAL_CAP_MESSAGE } },
    );
    fireEvent.click(await screen.findByTitle("Add to library"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: TRIAL_CAP_MESSAGE, variant: "destructive", action: expect.anything(),
    })));
  });
});

describe("PendingImports while a mailbox sync holds the lock", () => {
  const billing = { plan: "pro", accessState: "active", canUseApp: true, canUpload: true };

  it("shows a neutral 'still syncing' toast and keeps the item", async () => {
    mount(billing, { ok: false, status: 409, body: { error: "busy", code: "SYNC_IN_PROGRESS" } });
    fireEvent.click(await screen.findByTitle("Add to library"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: "Still syncing your email — try again in a minute",
    }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(screen.getByText("Worten")).toBeInTheDocument();
  });

  it("refreshes the list instead of showing an error when the import was already handled", async () => {
    const fetchMock = mount(billing, { ok: false, status: 409, body: { error: "Pending import was already handled" } });
    fireEvent.click(await screen.findByTitle("Add to library"));
    const pendingCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("api/mail/pending")).length;
    await waitFor(() => expect(pendingCalls()).toBeGreaterThanOrEqual(2));
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

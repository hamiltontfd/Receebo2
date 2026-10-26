import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
import { MailConnections } from "./MailConnections";

function provider(overrides: Record<string, unknown>) {
  return {
    id: "outlook", label: "Outlook", enabled: true, configured: true, connected: false,
    accountEmail: null, lastSyncedAt: null, needsReconnect: false, ...overrides,
  };
}

function showWith(status: unknown) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.includes("connect-url")
      ? { url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize" }
      : status),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MailConnections /></QueryClientProvider>);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("MailConnections", () => {
  it("shows a clean placeholder when no provider is available", async () => {
    showWith({ providers: [], pendingCount: 0 });
    expect(await screen.findByTestId("mail-providers-empty")).toHaveTextContent("coming soon");
    expect(screen.queryByText(/Gmail/)).not.toBeInTheDocument();
  });

  it("offers Connect Outlook when enabled and configured", async () => {
    showWith({ providers: [provider({})], pendingCount: 0 });
    expect(await screen.findByRole("button", { name: /Connect Outlook/ })).toBeInTheDocument();
  });

  it("shows a Reconnect banner when the connection expired", async () => {
    const fetchMock = showWith({
      providers: [provider({ connected: true, accountEmail: "me@outlook.com", needsReconnect: true })],
      pendingCount: 0,
    });
    expect(await screen.findByTestId("mail-reconnect-outlook")).toHaveTextContent("stopped syncing");
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/outlook/connect-url", expect.anything(),
    ));
  });

  it("shows a retired Gmail connection with only a Disconnect action", async () => {
    showWith({
      providers: [provider({ id: "gmail", label: "Gmail", enabled: false, connected: true, accountEmail: "me@gmail.com" })],
      pendingCount: 0,
    });
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sync/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect/ })).not.toBeInTheDocument();
  });
});

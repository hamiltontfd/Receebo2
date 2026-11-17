import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { request, auth } = vi.hoisted(() => ({ request: vi.fn(), auth: { isLoaded: true, isSignedIn: true, userId: null as string | null } }));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
vi.mock("@workspace/api-client-react", async importOriginal => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(),
  customFetch: request,
}));
import { useStartTrial } from "./useBilling";
import { beginAccountConsentSync } from "@/lib/accountConsentSync";

afterEach(() => { vi.useRealTimers(); request.mockReset(); auth.userId = null; });

describe("trial initialization without real API writes", () => {
  it("does not send start-trial before the current consent PATCH completes", async () => {
    auth.userId = "trial-consent-order";
    const completePatch = beginAccountConsentSync(auth.userId);
    request.mockResolvedValue({ started: true });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useStartTrial(), { wrapper });
    await act(async () => result.current.mutate());
    expect(request).not.toHaveBeenCalled();
    await act(async () => completePatch());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toMatch(/\/api\/billing\/start-trial$/);
    unmount(); client.clear();
  });
  it("retries transient 401s without a visible mutation error, then accepts the idempotent success", async () => {
    vi.useFakeTimers();
    request.mockRejectedValueOnce({ status: 401 }).mockRejectedValueOnce({ status: 401 })
      .mockResolvedValue({ started: true });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useStartTrial(), { wrapper });
    act(() => result.current.mutate());
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.isError).toBe(false);
    expect(result.current.isPending).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.isError).toBe(false);
    unmount(); client.clear();
  });
  it("still reports a genuine validation failure without retrying it", async () => {
    vi.useFakeTimers();
    request.mockRejectedValue({ status: 400 });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useStartTrial(), { wrapper });
    act(() => result.current.mutate());
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.isError).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    unmount(); client.clear();
  });
});

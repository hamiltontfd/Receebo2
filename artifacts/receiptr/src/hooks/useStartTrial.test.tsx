import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }) }));
vi.mock("@workspace/api-client-react", async importOriginal => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(),
  customFetch: request,
}));
import { useStartTrial } from "./useBilling";

afterEach(() => { vi.useRealTimers(); request.mockReset(); });

describe("trial initialization without real API writes", () => {
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

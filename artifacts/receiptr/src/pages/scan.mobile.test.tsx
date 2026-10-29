import { act, fireEvent, render, waitFor, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), customFetch: vi.fn(),
  toast: vi.fn(), stop: vi.fn(), getUserMedia: vi.fn(),
  billing: { plan: "free", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 2 } as Record<string, unknown>,
}));
vi.mock("@/hooks/useBilling", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useBilling")>("@/hooks/useBilling");
  return {
    ...actual,
    useBillingStatus: () => ({
      data: mocks.billing,
      refetch: async () => ({ data: mocks.billing, isError: false }),
    }),
    useRefreshBilling: () => vi.fn(),
  };
});
vi.mock("@workspace/api-client-react", () => ({
  useCreateReceipt: () => ({ mutateAsync: mocks.create }),
  useUpdateReceipt: () => ({ mutateAsync: mocks.update }),
  useDeleteReceipt: () => ({ mutateAsync: mocks.remove }),
  useGetReceipt: () => ({ data: undefined }),
  customFetch: mocks.customFetch,
  checkSimilarReceipt: vi.fn(),
  getGetReceiptQueryKey: (id: number) => ["receipt", id],
  getListReceiptsQueryKey: () => ["receipts"],
  getGetReceiptStatsQueryKey: () => ["stats"],
  getGetRecentReceiptsQueryKey: () => ["recent"],
  ApiError: class ApiError extends Error { status = 0; data = null; },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/compressImage", () => ({
  compressImage: async (file: File, contentType: string) => ({ blob: file, contentType }),
  compressedFileName: (name: string) => name,
}));
import Scan from "./scan";
import { rememberTab, setPendingUpload, takePendingUpload } from "@/lib/navState";

const track = { stop: vi.fn(), getCapabilities: vi.fn(() => ({})), applyConstraints: vi.fn(async () => undefined) };
beforeEach(() => {
  vi.clearAllMocks();
  takePendingUpload();
  mocks.billing = { plan: "free", accessState: "account_trial", canUseApp: true, canUpload: true, trialUploadsRemaining: 2 };
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  // Phone: no desktop media query match.
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  mocks.create.mockResolvedValue({ id: 42 });
  mocks.customFetch.mockResolvedValue({ uploadURL: "https://uploads.test/signed", objectPath: "/objects/file" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  track.getCapabilities.mockReturnValue({});
  mocks.getUserMedia.mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: mocks.getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
function mount() {
  const loc = memoryLocation({ path: "/scan", record: true });
  const result = render(<QueryClientProvider client={new QueryClient()}><Router hook={loc.hook}><Scan /></Router></QueryClientProvider>);
  return { ...result, loc };
}

describe("full-screen phone camera", () => {
  it("opens the camera straight away, edge to edge, with no upload control", async () => {
    mount();
    expect(screen.getByTestId("fullscreen-camera")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } }));
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    expect(screen.getByRole("radio", { name: /photo/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("text-scan-trial-left").textContent).toBe("2 of 5 free receipts left");
  });
  it("X returns to the previous tab", async () => {
    rememberTab("/stats");
    const { loc } = mount();
    fireEvent.click(screen.getByTestId("button-camera-close"));
    expect(loc.history?.at(-1)).toBe("/stats");
    rememberTab("/search");
  });
  it("shutter takes the photo and starts the existing upload", async () => {
    const result = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Take photo" })).not.toBeDisabled());
    const video = result.container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 100 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 200 });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["camera"], { type: "image/jpeg" })));
    await act(async () => screen.getByRole("button", { name: "Take photo" }).click());
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Reading receipt")).toBeInTheDocument());
    expect(screen.queryByTestId("fullscreen-camera")).toBeNull();
  });
  it("LONG RECEIPT switches the shutter to the panoramic capture", async () => {
    mount();
    await waitFor(() => expect(screen.getByRole("radio", { name: /long receipt/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("radio", { name: /long receipt/i }));
    expect(screen.getByRole("radio", { name: /long receipt/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Start panoramic capture" })).toBeInTheDocument();
  });
  it("shows the flash only when the camera has a torch, and toggles it", async () => {
    track.getCapabilities.mockReturnValue({ torch: true });
    mount();
    const flash = await screen.findByTestId("button-camera-flash");
    expect(flash).toHaveAttribute("aria-pressed", "false");
    await act(async () => flash.click());
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    await waitFor(() => expect(flash).toHaveAttribute("aria-pressed", "true"));
  });
  it("has no flash button without torch support", async () => {
    mount();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalled());
    expect(screen.queryByTestId("button-camera-flash")).toBeNull();
  });
});

describe("Add sheet → Upload file handoff", () => {
  it("uploads the handed-over file without opening the camera", async () => {
    const file = new File(["file"], "receipt.pdf", { type: "application/pdf" });
    setPendingUpload(file);
    mount();
    expect(screen.queryByTestId("fullscreen-camera")).toBeNull();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      data: { objectPath: "/objects/file", originalFileName: "receipt.pdf", contentType: "application/pdf" },
    }));
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });
  it("goes back to the previous tab when the handed-over upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    rememberTab("/search");
    setPendingUpload(new File(["file"], "receipt.jpg", { type: "image/jpeg" }));
    const { loc } = mount();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Upload failed" })));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/search"));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

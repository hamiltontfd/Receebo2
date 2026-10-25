import { act, fireEvent, render, waitFor, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), customFetch: vi.fn(),
  toast: vi.fn(), stop: vi.fn(), getUserMedia: vi.fn(),
}));
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
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/compressImage", () => ({
  compressImage: async (file: File, contentType: string) => ({ blob: file, contentType }),
  compressedFileName: (name: string) => name,
}));
import Scan from "./scan";
import { hasPwaWork } from "@/lib/pwa";
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  mocks.create.mockResolvedValue({ id: 42 });
  mocks.customFetch.mockResolvedValue({ uploadURL: "https://uploads.test/signed", objectPath: "/objects/file" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  mocks.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: mocks.stop }] });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true, value: { getUserMedia: mocks.getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
function mount() {
  return render(<QueryClientProvider client={new QueryClient()}><Router><Scan /></Router></QueryClientProvider>);
}

describe("upload paths with PWA safeguards", () => {
  it.each(["image/jpeg", "image/png", "application/pdf"])("preserves the %s signed upload and receipt creation", async (type) => {
    const result = mount();
    const file = new File(["file"], type === "application/pdf" ? "receipt.pdf" : "receipt.jpg", { type });
    fireEvent.change(result.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      data: { objectPath: "/objects/file", originalFileName: file.name, contentType: type },
    }));
    expect(mocks.customFetch).toHaveBeenCalledWith(expect.stringContaining("api/storage/uploads/request-url"), expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: type }),
    }));
    expect(fetch).toHaveBeenCalledWith("https://uploads.test/signed", expect.objectContaining({ method: "PUT", body: file }));
    expect(hasPwaWork()).toBe(true);
    result.unmount();
    expect(hasPwaWork()).toBe(false);
  });
  it("does not create a receipt or report success when the PUT fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const result = mount();
    fireEvent.change(result.container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["file"], "receipt.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Upload failed" })));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refuses offline uploads with no signed request, PUT, or queued creation", async () => {
    Object.defineProperty(navigator, "onLine", { value: false });
    const result = mount();
    fireEvent.change(result.container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["file"], "receipt.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Connection required" })));
    expect(mocks.customFetch).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps camera opt-in, capture and track cleanup intact", async () => {
    const result = mount();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: /camera/i }).click());
    expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
    expect(hasPwaWork()).toBe(true);
    const video = result.container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 100 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 200 });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["camera"], { type: "image/jpeg" })));
    const capture = result.container.querySelector('button[aria-label]') as HTMLButtonElement | null;
    // Capture control is labelled "Take photo" for assistive technology.
    expect(capture).not.toBeNull();
    await act(async () => screen.getByRole("button", { name: /take photo|capture/i }).click());
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.stop).toHaveBeenCalled();
  });
});

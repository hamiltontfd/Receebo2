import { act, fireEvent, render, waitFor, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), customFetch: vi.fn(),
  toast: vi.fn(), stop: vi.fn(), getUserMedia: vi.fn(),
  receipt: undefined as Record<string, unknown> | undefined,
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
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(),
  useCreateReceipt: () => ({ mutateAsync: mocks.create }),
  useUpdateReceipt: () => ({ mutateAsync: mocks.update }),
  useDeleteReceipt: () => ({ mutateAsync: mocks.remove }),
  useGetReceipt: () => ({ data: mocks.receipt }),
  customFetch: mocks.customFetch,
  checkSimilarReceipt: vi.fn(async () => []),
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
import { rememberTab, setPendingUpload, takePendingUpload } from "@/lib/navState";
import { setAccountLocale } from "@/lib/locale";

const track = { stop: vi.fn(), getCapabilities: vi.fn(() => ({})), applyConstraints: vi.fn(async () => undefined) };
afterEach(() => setAccountLocale(undefined));
beforeEach(() => {
  setAccountLocale("en");
  vi.clearAllMocks();
  mocks.receipt = undefined;
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
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledWith({
      // A sharp stream: the browser default (640x480) cannot read a full A4 invoice.
      video: { facingMode: "environment", width: { ideal: 3840 }, height: { ideal: 2160 } },
    }));
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
  it("keeps the handed-over file for an explicit retry when uploading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    rememberTab("/search");
    setPendingUpload(new File(["file"], "receipt.jpg", { type: "image/jpeg" }));
    const { loc } = mount();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Upload failed" })));
    expect(loc.history?.at(-1)).not.toBe("/search");
    expect(screen.getByRole("button", { name: "Retry saved file" })).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

async function shootPhoto(result: ReturnType<typeof mount>) {
  await waitFor(() => expect(screen.getByTestId("button-shutter")).not.toBeDisabled());
  const video = result.container.querySelector("video")!;
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 100 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 200 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["camera"], { type: "image/jpeg" })));
  await act(async () => screen.getByTestId("button-shutter").click());
  await waitFor(() => expect(mocks.create).toHaveBeenCalled());
}

describe("after reading", () => {
  it("asks for a better photo when the receipt was unreadable, and retakes", async () => {
    mocks.receipt = { id: 42, status: "unreadable", products: [], notableItems: [] };
    mocks.remove.mockResolvedValue(undefined);
    const result = mount();
    await shootPhoto(result);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Photo hard to read" })).toBeInTheDocument());
    expect(screen.queryByText("No receipt found")).toBeNull();
    expect(screen.getByText(/nothing was saved/)).toBeInTheDocument();
    mocks.receipt = undefined;
    await act(async () => screen.getByRole("button", { name: "Take a new photo" }).click());
    expect(mocks.remove).toHaveBeenCalledWith({ id: 42 });
    expect(await screen.findByTestId("fullscreen-camera")).toBeInTheDocument();
  });

  it("keeps the not-a-receipt screen for non-receipts", async () => {
    mocks.receipt = { id: 42, status: "not_a_receipt", products: [], notableItems: [] };
    const result = mount();
    await shootPhoto(result);
    await waitFor(() => expect(screen.getByText("No receipt found")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("never wraps the narrow currency symbol next to the localized total (BRL on a 390px phone)", async () => {
    setAccountLocale("pt-BR");
    mocks.receipt = {
      id: 42, status: "completed", merchant: "LLT", purchaseDate: "2026-08-12", total: 56.9, currency: "BRL",
      products: [{ name: "Cimento", quantity: 1, price: 35.5 }], notableItems: [],
    };
    const result = mount();
    await shootPhoto(result);
    const code = await screen.findByTestId("text-total-currency", {}, { timeout: 3000 });
    expect(code.textContent).toBe("R$");
    expect(code).toHaveClass("shrink-0", "whitespace-nowrap");
    const input = screen.getByRole("textbox", { name: "Total" });
    expect(input).toHaveValue("56,90");
    expect(input).toHaveClass("min-w-0");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("placeholder", "0,00");
    fireEvent.change(input, { target: { value: "3199,00" } });
    expect(input).toHaveValue("3199,00");
    fireEvent.click(screen.getByRole("button", { name: "Salvar compra" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 42, data: expect.objectContaining({ total: 3199 }),
    })));
  });

  it.each(["649,00", "649.00", "3.199,00", "3,199.00", "649,"])(
    "keeps raw typing and saves %s as a finite numeric total",
    async (typed) => {
      mocks.receipt = {
        id: 42, status: "completed", merchant: "Sample store", total: 486, currency: "USD",
        products: [], notableItems: [],
      };
      const result = mount();
      await shootPhoto(result);
      const input = await screen.findByRole("textbox", { name: "Total" });
      expect(input).toHaveValue("486.00");
      expect(input).toHaveAttribute("placeholder", "0.00");
      fireEvent.change(input, { target: { value: typed } });
      expect(input).toHaveValue(typed);
      fireEvent.blur(input);
      expect(input).toHaveValue(typed);
      fireEvent.click(screen.getByRole("button", { name: "Save Purchase" }));
      const expected = typed.startsWith("3") ? 3199 : 649;
      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
        id: 42, data: expect.objectContaining({ total: expected }),
      })));
    },
  );

  it("blocks invalid totals and clears the validation error when corrected", async () => {
    mocks.receipt = {
      id: 42, status: "completed", merchant: "Sample store", total: 486, currency: "USD",
      products: [], notableItems: [],
    };
    const result = mount();
    await shootPhoto(result);
    const input = await screen.findByRole("textbox", { name: "Total" });
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Purchase" }));
    expect(input).toBeInvalid();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toBeValid();
    fireEvent.click(screen.getByRole("button", { name: "Save Purchase" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 42, data: expect.objectContaining({ total: undefined }),
    })));
  });
});

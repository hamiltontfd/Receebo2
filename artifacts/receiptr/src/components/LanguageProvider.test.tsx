import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "./LanguageProvider";
import { LanguageSelector } from "./LanguageSelector";
import { getAppLocale, LOCALE_STORAGE_KEY, setAccountLocale, useAppLocale } from "@/lib/locale";
import { lt } from "@/lib/landingLocale";

const mocks = vi.hoisted(() => ({
  auth: { userId: null as string | null, isLoaded: true },
  request: vi.fn(),
}));
vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: (...args: unknown[]) => mocks.request(...args) }));
function View() {
  const locale = useAppLocale();
  return <><LanguageSelector /><output data-testid="locale">{locale}</output>
    <span>{lt("Translated content", "Conteúdo traduzido")}</span></>;
}
const view = () => render(<LanguageProvider><View /></LanguageProvider>);
const select = () => screen.getByRole("combobox");
const choose = (value: string) => fireEvent.change(select(), { target: { value } });
const language = () => screen.getByTestId("locale").textContent;
beforeEach(() => {
  mocks.auth = { userId: null, isLoaded: true };
  mocks.request.mockReset();
  localStorage.clear();
  setAccountLocale(undefined);
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
});
afterEach(() => { cleanup(); setAccountLocale(undefined); vi.restoreAllMocks(); });

describe("language preference", () => {
  it("saves visitor choice locally and updates translated content and document immediately", async () => {
    view();
    choose("pt-BR");
    await waitFor(() => expect(language()).toBe("pt-BR"));
    expect(screen.getByText("Conteúdo traduzido")).toBeTruthy();
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
    expect(mocks.request).not.toHaveBeenCalled();
    cleanup();
    view();
    expect(language()).toBe("pt-BR");
    choose("auto");
    await waitFor(() => expect(language()).toBe("en"));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });
  it("uses browser language and reacts to browser language changes in automatic mode", async () => {
    view();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-PT"]);
    act(() => window.dispatchEvent(new Event("languagechange")));
    await waitFor(() => expect(language()).toBe("pt-PT"));
  });
  it("loads the account without importing or overwriting visitor preferences", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    mocks.auth.userId = "A";
    mocks.request.mockResolvedValue({ language: "pt-PT" });
    view();
    await waitFor(() => expect(language()).toBe("pt-PT"));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][1].method).toBeUndefined();
  });
  it("saves and resets an account preference, retaining market and visitor storage", async () => {
    mocks.auth.userId = "A";
    localStorage.setItem("receebo:visitorMarket", "US");
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    mocks.request.mockResolvedValue({ language: "en" });
    view();
    await waitFor(() => expect(select()).not.toBeDisabled());
    mocks.request.mockResolvedValue({ language: "pt-PT" });
    choose("pt-PT");
    await waitFor(() => expect(language()).toBe("pt-PT"));
    expect(JSON.parse(mocks.request.mock.calls.at(-1)![1].body)).toEqual({ language: "pt-PT" });
    mocks.request.mockResolvedValue({ language: null });
    choose("auto");
    await waitFor(() => expect(language()).toBe("en"));
    expect(localStorage.getItem("receebo:visitorMarket")).toBe("US");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
    cleanup();
    view();
    await waitFor(() => expect(select()).not.toBeDisabled());
    expect(language()).toBe("en");
  });
  it("discards late account reads on account switch and restores visitors on logout", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    mocks.auth.userId = "A";
    let resolve!: (data: { language: string }) => void;
    mocks.request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const result = view();
    mocks.auth.userId = "B";
    mocks.request.mockResolvedValue({ language: "en" });
    result.rerender(<LanguageProvider><View /></LanguageProvider>);
    await waitFor(() => expect(select()).not.toBeDisabled());
    await act(async () => resolve({ language: "pt-PT" }));
    expect(language()).toBe("en");
    mocks.auth.userId = null;
    result.rerender(<LanguageProvider><View /></LanguageProvider>);
    await waitFor(() => expect(language()).toBe("pt-BR"));
  });
  it("shows failed reads with explicit retry and never adopts visitor choice", async () => {
    mocks.auth.userId = "A";
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    mocks.request.mockRejectedValue(new Error("offline"));
    view();
    await screen.findByRole("alert");
    expect(language()).toBe("en");
    mocks.request.mockResolvedValue({ language: "pt-PT" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(language()).toBe("pt-PT"));
  });
  it("keeps the previous language after failed saves, without replaying on focus", async () => {
    mocks.auth.userId = "A";
    mocks.request.mockResolvedValue({ language: "en" });
    view();
    await waitFor(() => expect(select()).not.toBeDisabled());
    mocks.request.mockRejectedValue(new Error("offline"));
    choose("pt-BR");
    await screen.findByRole("alert");
    expect(language()).toBe("en");
    const count = mocks.request.mock.calls.length;
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.request).toHaveBeenCalledTimes(count);
    mocks.request.mockResolvedValue({ language: "pt-BR" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(language()).toBe("pt-BR"));
  });
  it("refetches account preferences on focus for changes made in another session", async () => {
    mocks.auth.userId = "A";
    mocks.request.mockResolvedValue({ language: "en" });
    view();
    await waitFor(() => expect(select()).not.toBeDisabled());
    mocks.request.mockResolvedValue({ language: "pt-BR" });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(language()).toBe("pt-BR"));
  });
  it("reports unavailable visitor storage instead of pretending the choice was saved", async () => {
    view();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    choose("pt-BR");
    await screen.findByRole("alert");
    expect(getAppLocale()).toBe("en");
  });
  it("reacts to visitor preferences from another tab", async () => {
    view();
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-PT");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: LOCALE_STORAGE_KEY })));
    await waitFor(() => expect(language()).toBe("pt-PT"));
  });
});

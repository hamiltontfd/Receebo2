import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/MarketSelector", () => ({ MarketSelector: () => <div>Market selector</div> }));
vi.mock("@/components/LanguageSelector", () => ({ LanguageSelector: () => <div>Language selector</div> }));

const state = vi.hoisted(() => ({ signedIn: true, pending: true, userId: "A", ready: false, markSearchDone: vi.fn() }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: state.signedIn, userId: state.userId }) }));
vi.mock("@/components/GuestProvider", () => ({ useGuestMode: () => ({ isGuest: !state.signedIn }) }));
vi.mock("@/lib/useOnboarding", () => ({ useOnboarding: () => ({
  dismissed: true, step1Done: true, ready: state.ready, markSearchDone: state.markSearchDone,
}) }));
vi.mock("@/components/OnboardingCard", () => ({ OnboardingCard: () => null }));
vi.mock("@/components/PendingImports", () => ({
  default: () => (state.pending ? <section data-testid="pending-imports">Found in your email</section> : null),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/components/ReceiptSheet", () => ({ ReceiptSheet: () => null }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/search", () => {}],
}));
const receipts = [
  { id: 1, objectPath: "/o", originalFileName: "r1.jpg", contentType: "image/jpeg", status: "completed", createdAt: "2026-10-28T10:00:00Z",
    currency: "EUR", purchaseCountry: "PT", category: "Electronics", merchant: "Casa Lumen", purchaseDate: "2026-10-27",
    isOnlinePurchase: true, total: 649, notableItems: [{ name: "Smart TV", price: 599, reason: "" }] },
];
vi.mock("@workspace/api-client-react", () => ({
  useInfiniteListReceipts: () => ({ data: { pages: [{ items: receipts, nextCursor: null }] }, isLoading: false, isFetchingNextPage: false, hasNextPage: false, fetchNextPage: () => {} }),
  useListReceipts: () => ({ data: undefined, isLoading: false }),
}));
import SearchPage from "./search";

beforeEach(() => {
  state.userId = "A"; state.ready = false; state.markSearchDone.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 29, 9));
  window.matchMedia = window.matchMedia ?? ((() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia);
  class IO { observe() {} disconnect() {} unobserve() {} }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); state.signedIn = true; state.pending = true; });

const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Search onboarding hydration", () => {
  it("records a typed search once readiness arrives, not on the initial empty hydration", async () => {
    const view = render(<SearchPage />);
    expect(state.markSearchDone).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Search purchases..."), { target: { value: "TV" } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
    expect(state.markSearchDone).not.toHaveBeenCalled();
    state.ready = true;
    view.rerender(<SearchPage />);
    await waitFor(() => expect(state.markSearchDone).toHaveBeenCalledTimes(1));
    view.rerender(<SearchPage />);
    expect(state.markSearchDone).toHaveBeenCalledTimes(1);
  });
  it("does not complete another account's search from a previous account's input", async () => {
    const view = render(<SearchPage />);
    fireEvent.change(screen.getByPlaceholderText("Search purchases..."), { target: { value: "TV" } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
    state.userId = "B"; state.ready = true;
    view.rerender(<SearchPage />);
    expect(screen.getByPlaceholderText("Search purchases...")).toHaveValue("");
    expect(state.markSearchDone).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Search purchases..."), { target: { value: "   " } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
    expect(state.markSearchDone).not.toHaveBeenCalled();
  });
});

describe("Signed-in home account preferences", () => {
  it.each([390, 1440])("does not mount market or language selectors at %ipx", (width) => {
    vi.stubGlobal("innerWidth", width);
    state.signedIn = true;
    render(<SearchPage />);
    expect(screen.getByPlaceholderText("Search purchases...")).toBeInTheDocument();
    expect(screen.queryByText("Market selector")).not.toBeInTheDocument();
    expect(screen.queryByText("Language selector")).not.toBeInTheDocument();
  });
});

describe("Search home: Worth keeping position", () => {
  it("sits right after Found in your email", () => {
    render(<SearchPage />);
    const pending = screen.getByTestId("pending-imports");
    const keep = screen.getByTestId("search-worth-keeping");
    expect(follows(pending, keep)).toBe(true);
    expect(pending.nextElementSibling).toBe(keep);
    expect(follows(screen.getByPlaceholderText("Search purchases..."), keep)).toBe(true);
    expect(follows(screen.getByRole("button", { name: "Groceries" }), keep)).toBe(true);
  });

  it("takes its place when Found in your email isn't shown", () => {
    state.pending = false;
    render(<SearchPage />);
    expect(screen.queryByTestId("pending-imports")).toBeNull();
    const keep = screen.getByTestId("search-worth-keeping");
    expect(screen.getByRole("button", { name: "Groceries" }).closest("div")!.nextElementSibling).toBe(keep);
  });
});

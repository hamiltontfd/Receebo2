import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ signedIn: true, pending: true }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: state.signedIn }) }));
vi.mock("@/components/GuestProvider", () => ({ useGuestMode: () => ({ isGuest: !state.signedIn }) }));
vi.mock("@/lib/useOnboarding", () => ({ useOnboarding: () => ({ dismissed: true, step1Done: true, markSearchDone: () => {} }) }));
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
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 29, 9));
  window.matchMedia = window.matchMedia ?? ((() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia);
  class IO { observe() {} disconnect() {} unobserve() {} }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});
afterEach(() => { vi.useRealTimers(); state.signedIn = true; state.pending = true; });

const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

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

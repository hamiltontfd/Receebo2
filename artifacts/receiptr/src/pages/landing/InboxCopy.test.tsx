import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import EmailReceiptsSection from "./EmailReceiptsSection";
import FAQSection from "./FAQSection";
import { resetAvailableMailProvidersCache } from "@/lib/availableMailProviders";

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function serveProviders(providers: { id: string; label: string }[]) {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ providers }) }),
  );
}

afterEach(() => {
  cleanup();
  resetAvailableMailProvidersCache();
  vi.unstubAllGlobals();
});

describe("landing inbox copy follows the enabled mail providers", () => {
  it("advertises Outlook, not Gmail, by default", async () => {
    serveProviders([{ id: "outlook", label: "Outlook" }]);
    const { container } = render(
      <>
        <EmailReceiptsSection />
        <FAQSection />
      </>,
    );
    await waitFor(() => expect(screen.getByText("Connect Outlook")).toBeInTheDocument());
    expect(container.textContent).toMatch(/your Outlook inbox/);
    expect(container.textContent).toMatch(/Hotmail/);
    expect(container.textContent).not.toMatch(/Gmail/);
  });

  it("falls back to provider-neutral copy when nothing is connectable", async () => {
    serveProviders([]);
    const { container } = render(<EmailReceiptsSection />);
    await waitFor(() => expect(screen.getByText("Connect your inbox")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/Gmail|Outlook/);
  });

  it("restores Gmail when the flag enables it again", async () => {
    serveProviders([
      { id: "gmail", label: "Gmail" },
      { id: "outlook", label: "Outlook" },
    ]);
    render(<EmailReceiptsSection />);
    await waitFor(() =>
      expect(screen.getByText("Connect Gmail or Outlook")).toBeInTheDocument(),
    );
  });
});

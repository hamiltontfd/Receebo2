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
    // Outlook-only copy (marketing, 26 Oct 2026).
    expect(screen.getByRole("heading", { name: "Import from Outlook" })).toBeInTheDocument();
    expect(screen.getByTestId("text-email-section-body").textContent).toBe(
      "Connect your Outlook inbox and Receebo finds your receipts for you. You approve each one before it's saved. Outlook only for now; more email providers are coming.",
    );
    expect(screen.getByText("Which email providers work?")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Gmail/);
  });

  it("puts the Outlook-only FAQ answer in the FAQ list", async () => {
    const { OUTLOOK_ONLY_FAQ, isOutlookOnly } = await import("@/lib/availableMailProviders");
    expect(OUTLOOK_ONLY_FAQ.a).toBe(
      "For now, only Outlook (including Hotmail and Live accounts). For any other email, save the receipt or order confirmation as a PDF and upload it.",
    );
    expect(isOutlookOnly([{ id: "outlook" }])).toBe(true);
    expect(isOutlookOnly([{ id: "outlook" }, { id: "gmail" }])).toBe(false);
    expect(isOutlookOnly([{ id: "outlook" }, { id: "gmail", enabled: false }])).toBe(true);
    expect(isOutlookOnly([])).toBe(false);
  });

  it("falls back to provider-neutral copy when nothing is connectable", async () => {
    serveProviders([]);
    const { container } = render(<EmailReceiptsSection />);
    await waitFor(() => expect(screen.getByText("Connect your inbox")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/Gmail|Outlook/);
    expect(container.textContent).toMatch(/Not every receipt/);
  });

  it("restores Gmail when the flag enables it again", async () => {
    serveProviders([
      { id: "gmail", label: "Gmail" },
      { id: "outlook", label: "Outlook" },
    ]);
    const { container } = render(<><EmailReceiptsSection /><FAQSection /></>);
    await waitFor(() =>
      expect(screen.getByText("Connect Gmail or Outlook")).toBeInTheDocument(),
    );
    expect(container.textContent).not.toMatch(/Import from Outlook|Outlook only for now/);
    expect(screen.queryByText("Which email providers work?")).toBeNull();
  });
});

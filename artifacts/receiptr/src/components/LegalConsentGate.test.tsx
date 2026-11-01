import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_ACCEPTED_EVENT, LegalConsentGate } from "./LegalConsentGate";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LegalConsentGate", () => {
  it("shows only the branded loading screen while legal status is pending", async () => {
    let resolveStatus!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveStatus = resolve; })));
    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Receebo")).toBeInTheDocument();
    expect(screen.getByText("Receipts. Easy to find.")).toBeInTheDocument();
    expect(screen.queryByText("Before you continue")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Private app")).not.toBeInTheDocument();

    resolveStatus(new Response(JSON.stringify({
      accepted: false, termsVersion: "2026-08-30", privacyVersion: "2026-08-30",
    }), { status: 200 }));
    expect(await screen.findByText("Before you continue")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
    expect(screen.queryByText("Private app")).not.toBeInTheDocument();
  });

  it("shows the app immediately when the current versions are accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accepted: true,
            termsVersion: "2026-08-30",
            privacyVersion: "2026-08-30",
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <LegalConsentGate>
        <div>Private app</div>
      </LegalConsentGate>,
    );

    expect(await screen.findByText("Private app")).toBeInTheDocument();
    expect(screen.queryByText("Before you continue")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("requires 18+ confirmation and submits the server-provided versions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accepted: false,
            termsVersion: "2026-08-30",
            privacyVersion: "2026-08-30",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const acceptedListener = vi.fn();
    window.addEventListener(LEGAL_ACCEPTED_EVENT, acceptedListener);

    render(
      <LegalConsentGate>
        <div>Private app</div>
      </LegalConsentGate>,
    );

    const button = await screen.findByRole("button", {
      name: "Agree and continue",
    });
    expect(button).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I confirm that I am at least 18 years old/i,
      }),
    );
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Private app")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/legal/acceptance"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          termsVersion: "2026-08-30",
          privacyVersion: "2026-08-30",
          confirmedAge: true,
        }),
      }),
    );
    expect(acceptedListener).toHaveBeenCalledOnce();
    window.removeEventListener(LEGAL_ACCEPTED_EVENT, acceptedListener);
  });

  it("does not expose the app when legal status cannot be verified", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(
      <LegalConsentGate>
        <div>Private app</div>
      </LegalConsentGate>,
    );

    expect(
      await screen.findByText(
        "We couldn't verify your legal acceptance. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Private app")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("returns to branded loading on retry and opens the app only after verification", async () => {
    let resolveRetry!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRetry = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Before you continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Private app")).not.toBeInTheDocument();
    resolveRetry(new Response(JSON.stringify({
      accepted: true, termsVersion: "2026-08-30", privacyVersion: "2026-08-30",
    }), { status: 200 }));
    expect(await screen.findByText("Private app")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_ACCEPTED_EVENT, LegalConsentGate } from "./LegalConsentGate";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LegalConsentGate", () => {
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
  });
});
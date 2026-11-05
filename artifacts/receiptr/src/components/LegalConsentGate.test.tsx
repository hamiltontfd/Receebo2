import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAccountLocale } from "@/lib/locale";
import {
  LEGAL_ACCEPTED_EVENT,
  LegalConsentGate,
  notifyLegalAcceptanceRequired,
} from "./LegalConsentGate";

afterEach(() => {
  setAccountLocale(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function acceptance(overrides: Record<string, unknown> = {}) {
  return {
    accepted: false,
    termsVersion: "2026-08-30",
    privacyVersion: "2026-11-04",
    acceptedAt: null,
    hadPriorAcceptance: false,
    previouslyConfirmedAge: false,
    ...overrides,
  };
}

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

    resolveStatus(new Response(JSON.stringify(acceptance()), { status: 200 }));
    expect(await screen.findByText("Before you continue")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
    expect(screen.queryByText("Private app")).not.toBeInTheDocument();
    expect(screen.getByTestId("legal-consent-fullpage")).toBeInTheDocument();
  });

  it("shows the app immediately when the current versions are accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(acceptance({
            accepted: true,
            acceptedAt: "2026-11-04T12:00:00.000Z",
            hadPriorAcceptance: true,
            previouslyConfirmedAge: true,
          })),
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
    expect(screen.queryByTestId("legal-consent-overlay")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("requires 18+ confirmation and submits the server-provided versions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptance()), { status: 200 }),
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
          privacyVersion: "2026-11-04",
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
    resolveRetry(new Response(JSON.stringify(acceptance({
      accepted: true, hadPriorAcceptance: true, previouslyConfirmedAge: true,
    })), { status: 200 }));
    expect(await screen.findByText("Private app")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens a blocking overlay over the loaded app for an outdated privacy version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(acceptance({
            acceptedAt: "2026-08-30T10:00:00.000Z",
            hadPriorAcceptance: true,
            previouslyConfirmedAge: true,
          })),
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
    expect(screen.getByTestId("legal-consent-app-behind")).toBeInTheDocument();
    expect(screen.getByTestId("legal-consent-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("legal-policy-updated")).toHaveTextContent(
      "We've updated our Privacy Policy. Please review and accept to keep using the app.",
    );
    expect(screen.getByTestId("legal-consent-title")).toHaveTextContent("Updated Privacy Policy");
    expect(screen.queryByTestId("legal-age-checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept and continue" })).toBeEnabled();
  });

  it("shows the policy-updated line only for re-accept, not for first-time consent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(acceptance()), { status: 200 })),
    );
    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);
    expect(await screen.findByText("Before you continue")).toBeInTheDocument();
    expect(screen.queryByTestId("legal-policy-updated")).not.toBeInTheDocument();
    expect(screen.queryByText(/We've updated our Privacy Policy/i)).not.toBeInTheDocument();
  });

  it.each([
    {
      locale: "en" as const,
      title: "Updated Privacy Policy",
      notice: "We've updated our Privacy Policy. Please review and accept to keep using the app.",
      button: "Accept and continue",
    },
    {
      locale: "pt-PT" as const,
      title: "Política de Privacidade atualizada",
      notice: "Atualizámos a Política de Privacidade. Reveja e aceite para continuar a usar a aplicação.",
      button: "Aceitar e continuar",
    },
    {
      locale: "pt-BR" as const,
      title: "Política de Privacidade atualizada",
      notice: "Atualizamos a Política de Privacidade. Revise e aceite para continuar usando o app.",
      button: "Aceitar e continuar",
    },
  ])("translates the re-accept overlay for $locale", async ({ locale, title, notice, button }) => {
    setAccountLocale(locale);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(acceptance({
            acceptedAt: "2026-08-30T10:00:00.000Z",
            hadPriorAcceptance: true,
            previouslyConfirmedAge: true,
          })),
          { status: 200 },
        ),
      ),
    );
    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);
    expect(await screen.findByTestId("legal-consent-title")).toHaveTextContent(title);
    expect(screen.getByTestId("legal-policy-updated")).toHaveTextContent(notice);
    expect(screen.getByRole("button", { name: button })).toBeEnabled();
  });

  it("hides the overlay after accept on a re-accept account", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(acceptance({
            acceptedAt: "2026-08-30T10:00:00.000Z",
            hadPriorAcceptance: true,
            previouslyConfirmedAge: true,
          })),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);
    expect(await screen.findByTestId("legal-consent-overlay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await waitFor(() => {
      expect(screen.queryByTestId("legal-consent-overlay")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Private app")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/legal/acceptance"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          termsVersion: "2026-08-30",
          privacyVersion: "2026-11-04",
          confirmedAge: true,
        }),
      }),
    );
  });

  it("reopens the overlay from a mid-session 428 without blanking the app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(acceptance({
            accepted: true,
            acceptedAt: "2026-11-04T12:00:00.000Z",
            hadPriorAcceptance: true,
            previouslyConfirmedAge: true,
          })),
          { status: 200 },
        ),
      ),
    );
    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);
    expect(await screen.findByText("Private app")).toBeInTheDocument();
    expect(screen.queryByTestId("legal-consent-overlay")).not.toBeInTheDocument();

    notifyLegalAcceptanceRequired({
      termsVersion: "2026-08-30",
      privacyVersion: "2026-11-04",
    });

    expect(await screen.findByTestId("legal-consent-overlay")).toBeInTheDocument();
    expect(screen.getByText("Private app")).toBeInTheDocument();
    expect(screen.getByTestId("legal-policy-updated")).toBeInTheDocument();
  });

  it("still asks for 18+ on re-accept when age was never confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(acceptance({
            acceptedAt: "2026-08-30T10:00:00.000Z",
            hadPriorAcceptance: true,
            previouslyConfirmedAge: false,
          })),
          { status: 200 },
        ),
      ),
    );
    render(<LegalConsentGate><div>Private app</div></LegalConsentGate>);
    expect(await screen.findByTestId("legal-consent-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("legal-age-checkbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
  });
});

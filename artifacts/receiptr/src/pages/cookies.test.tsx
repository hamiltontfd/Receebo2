import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CookiePolicy from "./cookies";

const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/lib/locale", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/locale")>(),
  useAppLocale: () => state.locale,
}));

afterEach(() => {
  state.locale = "en";
  vi.unstubAllEnvs();
});

describe("cookie policy language scope", () => {
  it("keeps the reviewed English text, date and absence of draft notice", () => {
    vi.stubEnv("DEV", true);
    const { container } = render(<CookiePolicy />);
    expect(screen.getByText("Effective 17 November 2026")).toBeInTheDocument();
    expect(container.textContent).toContain("This page lists the cookies and similar storage Receebo uses.");
    expect(container.textContent).toContain("Sets _fbp (90 days) and _fbc (90 days, when you arrive from an ad).");
    expect(container.textContent).not.toMatch(/DRAFT|This draft lists/);
  });

  it.each(["pt-PT", "pt-BR"])("restores the previous Portuguese policy for %s", (locale) => {
    state.locale = locale;
    vi.stubEnv("DEV", true);
    const { container } = render(<CookiePolicy />);
    expect(screen.getByText("Effective 9 November 2026")).toBeInTheDocument();
    expect(container.textContent).toContain("Este rascunho lista os cookies e armazenamento semelhante que o Receebo usa. Os itens essenciais fazem a conta funcionar. O resto espera pela sua escolha quando a lei exige opt-in, e pode ser recusado no aviso ou nas definições de cookies.");
    expect(container.textContent).toContain("Mede páginas, início do trial, primeiro recibo do trial guardado, regressos no navegador e subscrições depois da escolha que permite marketing.");
    expect(container.textContent).toContain("Cookies da Meta, em geral até 90 dias. O evento de servidor só é enviado nessa ação.");
    expect(screen.getByTestId("legal-draft-notice")).toHaveTextContent("DRAFT — pending legal review. This notice is shown only in development.");
  });

  it("retains the original development-only visibility of the Portuguese draft notice", () => {
    state.locale = "pt-PT";
    vi.stubEnv("DEV", false);
    render(<CookiePolicy />);
    expect(screen.queryByTestId("legal-draft-notice")).not.toBeInTheDocument();
  });
});

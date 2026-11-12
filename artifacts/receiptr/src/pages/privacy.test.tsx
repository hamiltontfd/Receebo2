import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPolicy from "./privacy";

afterEach(() => vi.unstubAllEnvs());
describe("privacy measurement disclosure", () => {
  it("shows the Hamilton draft review notice even in a production build", () => {
    vi.stubEnv("DEV", false);
    const { container } = render(<PrivacyPolicy />);
    expect(screen.getByTestId("legal-draft-notice")).toHaveTextContent("DRAFT — pending legal review by Hamilton.");
    expect(container.textContent).toContain("Meta Pixel");
    expect(container.textContent).toContain("Meta Conversions API");
    expect(container.textContent).toContain("first saved trial receipt");
    expect(container.textContent).toContain("later UTC day");
  });
});

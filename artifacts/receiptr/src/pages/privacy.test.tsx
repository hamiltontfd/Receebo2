import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPolicy from "./privacy";

afterEach(() => vi.unstubAllEnvs());
describe("privacy measurement disclosure", () => {
  it("publishes the reviewed measurement and US rights disclosure without draft markers", () => {
    vi.stubEnv("DEV", false);
    const { container } = render(<PrivacyPolicy />);
    expect(screen.queryByTestId("legal-draft-notice")).not.toBeInTheDocument();
    expect(container.textContent).toContain("Meta Pixel");
    expect(container.textContent).toContain("Meta Conversions API");
    expect(container.textContent).toContain("first receipt saved during the trial");
    expect(container.textContent).toContain("later day");
    expect(container.textContent).toContain("11. Notice for US residents");
    expect(container.textContent).not.toMatch(/DRAFT|LEGAL REVIEW NEEDED/);
  });
});

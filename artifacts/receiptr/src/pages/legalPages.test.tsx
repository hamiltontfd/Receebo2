import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicy from "./privacy";
import TermsOfService from "./terms";

describe("legal pages", () => {
  it("Privacy Policy: dated 4 November 2026 (PRIVACY_VERSION 2026-11-04), anonymous rating and encryption at rest", () => {
    const { container } = render(<PrivacyPolicy />);
    expect(screen.getByText("Effective 4 November 2026")).toBeInTheDocument();
    const text = container.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain("we keep that rating anonymously after your account is deleted, with no link to you or your email");
    expect(text).toContain("encrypted at rest in our database, with a key stored separately from it");
  });

  it("Terms keep their own date", () => {
    render(<TermsOfService />);
    expect(screen.getByText("Effective 30 August 2026")).toBeInTheDocument();
  });
});

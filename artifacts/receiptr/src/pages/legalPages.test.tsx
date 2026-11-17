import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicy from "./privacy";
import TermsOfService from "./terms";

describe("legal pages", () => {
  it("Privacy Policy: dated 17 November 2026, anonymous rating and encryption at rest", () => {
    const { container } = render(<PrivacyPolicy />);
    expect(screen.getByText("Effective 17 November 2026")).toBeInTheDocument();
    const text = container.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain("we keep that rating anonymously after your account is deleted, with no link to you or your email");
    expect(text).toContain("encrypted at rest in our database, with a key stored separately from it");
  });

  it("Terms keep their own date without visible review markers", () => {
    const { container } = render(<TermsOfService />);
    expect(screen.getByText("Effective 30 August 2026")).toBeInTheDocument();
    expect(container.textContent).not.toContain("[LEGAL REVIEW NEEDED]");
    expect(container.textContent).toContain("the result is saved.");
    expect(container.textContent).toContain("one-time code sent to your account email.");
  });
});

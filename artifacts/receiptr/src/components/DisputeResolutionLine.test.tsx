import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DisputeResolutionLine from "./DisputeResolutionLine";

describe("DisputeResolutionLine", () => {
  it("renders the English line with a Terms link", () => {
    render(<DisputeResolutionLine />);
    expect(screen.getByTestId("text-dispute-resolution").textContent).toBe(
      "Alternative dispute resolution: TRIAVE (see Terms)",
    );
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("renders the Portuguese line with a Termos link", () => {
    render(<DisputeResolutionLine locale="pt" />);
    expect(screen.getByTestId("text-dispute-resolution").textContent).toBe(
      "Resolução alternativa de litígios: TRIAVE, ver Termos",
    );
    expect(screen.getByRole("link", { name: "Termos" }).getAttribute("href")).toBe("/terms");
  });
});

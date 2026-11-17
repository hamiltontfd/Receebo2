import { describe, expect, it } from "vitest";
import { clerkLocalization } from "./clerkLocalization";

describe("Clerk auth subtitles", () => {
  it.each(["en", "pt-PT", "pt-BR"] as const)("has no speed claim in %s", locale => {
    const copy = clerkLocalization(locale);
    expect(copy.signUp.start.subtitle).toBe(locale === "en"
      ? "Start organizing every receipt." : "Comece a organizar todos os seus recibos.");
    expect(JSON.stringify(copy)).not.toMatch(/in seconds|em segundos/i);
    expect(copy.signIn.start.subtitle).toBe("Welcome back. Please sign in to continue.");
  });
});

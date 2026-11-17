import { describe, expect, it } from "vitest";
import { clerkLocalization } from "./clerkLocalization";

describe("Clerk auth subtitles", () => {
  it.each(["en", "pt-PT", "pt-BR"] as const)("keeps English auth copy without a speed claim for %s", locale => {
    const copy = clerkLocalization(locale);
    expect(copy.signUp.start.title).toBe("Create your Receebo account");
    expect(copy.signUp.start.subtitle).toBe("Start organizing every receipt.");
    expect(JSON.stringify(copy)).not.toMatch(/in seconds|em segundos/i);
    expect(copy.signIn.start.subtitle).toBe("Welcome back. Please sign in to continue.");
  });
});

import { describe, expect, it } from "vitest";
import { MAIL_SYNC_MAX_WINDOW_DAYS, MAIL_SYNC_OVERLAP_MS, syncWindowStart } from "./mailSync";
import { buildGmailSearchQuery } from "./gmailSync";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-28T12:00:00Z");

describe("mail sync search window", () => {
  it("looks back 90 days before the first sync", () => {
    expect(MAIL_SYNC_MAX_WINDOW_DAYS).toBe(90);
    expect(syncWindowStart(null, now).toISOString()).toBe("2026-07-30T12:00:00.000Z");
  });

  it("starts 1 hour before the last complete sync", () => {
    expect(MAIL_SYNC_OVERLAP_MS).toBe(60 * 60 * 1000);
    const last = new Date(now - 4 * 60 * 60 * 1000); // Gmail timer: 4 h ago
    expect(syncWindowStart(last, now).toISOString()).toBe("2026-10-28T07:00:00.000Z");
    const yesterday = new Date(now - DAY); // Outlook daily sweep
    expect(syncWindowStart(yesterday, now).toISOString()).toBe("2026-10-27T11:00:00.000Z");
  });

  it("never looks back more than 90 days", () => {
    expect(syncWindowStart(new Date(now - 200 * DAY), now).getTime()).toBe(now - 90 * DAY);
    expect(syncWindowStart(new Date(now - 90 * DAY + 30 * 60 * 1000), now).getTime()).toBe(now - 90 * DAY);
  });

  it("treats a future or invalid timestamp safely", () => {
    expect(syncWindowStart(new Date(now + DAY), now).getTime()).toBe(now - MAIL_SYNC_OVERLAP_MS);
    expect(syncWindowStart(new Date(Number.NaN), now).getTime()).toBe(now - 90 * DAY);
  });
});

describe("Gmail search query", () => {
  it("only asks for mail after the window start", () => {
    const since = new Date("2026-10-28T07:00:00Z");
    const q = buildGmailSearchQuery(since);
    expect(q).toContain(`after:${since.getTime() / 1000}`);
    expect(q).toContain("subject:receipt");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser } },
}));
import { hasOwnerAccess, matchesOwnerIdentity, ownerAccessConfig } from "./ownerAccess";

function identity() {
  return {
    id: "user_owner",
    primaryEmailAddressId: "email_1",
    emailAddresses: [{
      id: "email_1",
      emailAddress: ownerAccessConfig.email,
      verification: { status: "verified" },
    }],
    externalAccounts: [{
      provider: "oauth_google",
      emailAddress: ownerAccessConfig.email,
      verification: { status: "verified" },
    }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  ownerAccessConfig.enabled = true;
});

describe("server-verified owner entitlement", () => {
  it("accepts the verified owner in either Clerk environment without fixed IDs", async () => {
    const user = identity();
    getUser.mockResolvedValue(user);
    expect(await hasOwnerAccess(user.id)).toBe(true);
    const productionUser = { ...user, id: "user_production_owner" };
    getUser.mockResolvedValue(productionUser);
    expect(await hasOwnerAccess(productionUser.id)).toBe(true);
  });

  it("rejects a different identity even with owner-looking metadata", () => {
    const user = identity();
    user.emailAddresses[0].emailAddress = "other@example.com";
    expect(matchesOwnerIdentity(user.id, {
      ...user,
      ...{ publicMetadata: { ownerAccess: true } },
    })).toBe(false);
  });

  it("rejects unverified or non-primary owner addresses", () => {
    const user = identity();
    user.emailAddresses[0].verification.status = "unverified";
    expect(matchesOwnerIdentity(user.id, user)).toBe(false);
    user.emailAddresses[0].verification.status = "verified";
    user.primaryEmailAddressId = "other";
    expect(matchesOwnerIdentity(user.id, user)).toBe(false);
  });

  it("requires a matching verified Google external account", () => {
    for (const changes of [
      { provider: "oauth_github" },
      { emailAddress: "other@example.com" },
      { verification: { status: "unverified" } },
    ]) {
      const user = identity();
      Object.assign(user.externalAccounts[0], changes);
      expect(matchesOwnerIdentity(user.id, user)).toBe(false);
    }
  });

  it("rejects identity mismatches and guests", async () => {
    expect(matchesOwnerIdentity("user_attacker", identity())).toBe(false);
    expect(await hasOwnerAccess("guest-123")).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("fails closed during identity lookup failures", async () => {
    getUser.mockRejectedValue(new Error("Clerk unavailable"));
    expect(await hasOwnerAccess("user_owner")).toBe(false);
  });

  it("revokes immediately via trusted configuration without changing the user", async () => {
    getUser.mockResolvedValue(identity());
    expect(await hasOwnerAccess("user_owner")).toBe(true);
    ownerAccessConfig.enabled = false;
    expect(await hasOwnerAccess("user_owner")).toBe(false);
    ownerAccessConfig.enabled = true;
  });
});

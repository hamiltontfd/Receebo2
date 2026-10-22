import { clerkClient } from "@clerk/express";

// Server-owned configuration. Set enabled to false to revoke the exemption.
export const ownerAccessConfig = {
  enabled: true,
  email: "hamiltontfd@gmail.com",
};

interface OwnerIdentity {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }>;
  externalAccounts: Array<{
    provider: string;
    emailAddress: string;
    verification: { status: string } | null;
  }>;
}

export function matchesOwnerIdentity(
  userId: string,
  user: OwnerIdentity,
  config = ownerAccessConfig,
): boolean {
  if (!config.enabled || !config.email || user.id !== userId) return false;
  const email = config.email.trim().toLowerCase();
  const primary = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  return Boolean(
    primary?.emailAddress.toLowerCase() === email &&
      primary.verification?.status === "verified" &&
      user.externalAccounts.some(
        (account) =>
          account.provider === "oauth_google" &&
          account.emailAddress.toLowerCase() === email &&
          account.verification?.status === "verified",
      ),
  );
}

export async function hasOwnerAccess(userId: string): Promise<boolean> {
  if (!ownerAccessConfig.enabled || !userId || userId.startsWith("guest")) return false;
  try {
    // Always resolve the current identity. No stale privilege cache after revocation.
    const user = await clerkClient.users.getUser(userId);
    return matchesOwnerIdentity(userId, user);
  } catch {
    // An identity-service failure must never grant complimentary access.
    return false;
  }
}

/**
 * Feature flag for mail import providers.
 *
 * MAIL_PROVIDERS_ENABLED is a comma-separated list, e.g. "outlook" or
 * "gmail,outlook". When unset, the default is "outlook" (Gmail hidden).
 * Set it to "none" (or an empty value) to disable every provider.
 *
 * A disabled provider is hidden in the UI, its scheduler does not start, and
 * its connect / callback / sync routes return 404. Disconnect keeps working so
 * existing tokens can still be revoked and removed.
 */

export const MAIL_PROVIDER_IDS = ["gmail", "outlook"] as const;
export type MailProviderId = (typeof MAIL_PROVIDER_IDS)[number];

export const DEFAULT_MAIL_PROVIDERS: readonly MailProviderId[] = ["outlook"];

interface FlagEnvironment {
  MAIL_PROVIDERS_ENABLED?: string;
}

export function isMailProviderId(value: string): value is MailProviderId {
  return (MAIL_PROVIDER_IDS as readonly string[]).includes(value);
}

export function enabledMailProviders(
  environment: FlagEnvironment = process.env,
): MailProviderId[] {
  const raw = environment.MAIL_PROVIDERS_ENABLED;
  if (raw === undefined) return [...DEFAULT_MAIL_PROVIDERS];
  const ids = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(isMailProviderId);
  return [...new Set(ids)];
}

export function isMailProviderEnabled(
  provider: MailProviderId,
  environment: FlagEnvironment = process.env,
): boolean {
  return enabledMailProviders(environment).includes(provider);
}

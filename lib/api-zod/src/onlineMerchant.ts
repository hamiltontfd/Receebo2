/** Channel inference only. Never determines the buyer's country or overrides false. */
export function merchantSuggestsOnline(merchant?: string | null, storeDomain?: string | null): boolean {
  if (merchant && /\bamazon\b/i.test(merchant)) return true;
  if (!storeDomain) return false;
  const hostname = storeDomain.trim().replace(/^https?:\/\//i, "").split(/[/?#:]/, 1)[0];
  return /^(?:[a-z0-9-]+\.)*amazon\.(?:com(?:\.(?:br|mx|au|be|tr))?|co\.(?:uk|jp|za)|es|pt|de|fr|it|nl|pl|se|ie|ca|in|sg|ae|sa|eg|jp|cn)$/i.test(hostname);
}

export function isOnlineForConsumerRights(
  isOnlinePurchase: boolean | null | undefined,
  merchant?: string | null,
  storeDomain?: string | null,
): boolean {
  return isOnlinePurchase === true
    || (isOnlinePurchase == null && merchantSuggestsOnline(merchant, storeDomain));
}

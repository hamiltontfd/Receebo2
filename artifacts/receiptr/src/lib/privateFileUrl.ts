// Avoid legacy one-hour HTTP-cache entries created before private responses
// used no-store. This is a cache migration, never an authorization mechanism.
export function privateFileUrl(objectPath: string) {
  return `${import.meta.env.BASE_URL}api/storage${objectPath}?private-cache=no-store`;
}

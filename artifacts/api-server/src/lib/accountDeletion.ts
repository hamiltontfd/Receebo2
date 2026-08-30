export async function cancelSubscriptionForDeletion(
  subscriptionId: string | null | undefined,
  cancel: (subscriptionId: string) => Promise<unknown>,
): Promise<void> {
  if (!subscriptionId) return;

  try {
    await cancel(subscriptionId);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code !== "resource_missing") throw error;
  }
}

export async function deleteAccountObjects(
  objectPaths: Iterable<string>,
  deleteObject: (objectPath: string) => Promise<void>,
  isNotFound: (error: unknown) => boolean,
  onFailure?: (objectPath: string, error: unknown) => void,
): Promise<string[]> {
  const failedPaths: string[] = [];

  for (const objectPath of new Set(objectPaths)) {
    try {
      await deleteObject(objectPath);
    } catch (error) {
      if (!isNotFound(error)) {
        failedPaths.push(objectPath);
        onFailure?.(objectPath, error);
      }
    }
  }

  return failedPaths;
}
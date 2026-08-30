export interface PendingImportObject {
  id: number;
  objectPath: string;
}

export async function deletePendingImportObjects(
  pendingImports: PendingImportObject[],
  deleteObject: (objectPath: string) => Promise<void>,
  isNotFound: (error: unknown) => boolean,
  onFailure?: (pendingImport: PendingImportObject, error: unknown) => void,
): Promise<number[]> {
  const failedIds: number[] = [];

  for (const pendingImport of pendingImports) {
    try {
      await deleteObject(pendingImport.objectPath);
    } catch (error) {
      if (!isNotFound(error)) {
        failedIds.push(pendingImport.id);
        onFailure?.(pendingImport, error);
      }
    }
  }

  return failedIds;
}
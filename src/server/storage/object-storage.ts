export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  contentType(key: string): Promise<string>;
  /** Entfernt das Objekt; ein bereits fehlendes Objekt ist kein Fehler. */
  delete(key: string): Promise<void>;
}

/** Wirft bei unsicheren Keys (Path-Traversal, absolute Pfade). */
export function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}

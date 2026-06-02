import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertSafeKey, type ObjectStorage } from "./object-storage";

/** Lokale Dateisystem-Implementierung. Content-Type wird in einer .meta-Datei abgelegt. */
export class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private abs(key: string): string {
    assertSafeKey(key);
    return join(this.root, key);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const p = this.abs(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    await writeFile(`${p}.meta`, contentType, "utf8");
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.abs(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }

  async contentType(key: string): Promise<string> {
    try {
      return (await readFile(`${this.abs(key)}.meta`, "utf8")).trim() || "application/octet-stream";
    } catch {
      return "application/octet-stream";
    }
  }
}

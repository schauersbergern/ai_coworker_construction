import { LocalStorage } from "./local-storage";
import type { ObjectStorage } from "./object-storage";

const root = process.env.STORAGE_DIR ?? "./storage";

export const storage: ObjectStorage = new LocalStorage(root);
export type { ObjectStorage } from "./object-storage";

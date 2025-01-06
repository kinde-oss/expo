import { StorageKeys } from "../enums";
import { IStorageProvider } from "./storageProvider.interface";

/**
 * Web storage provider (uses localStorage)
 */
export class WebStorageProvider implements IStorageProvider {
  setStorage(key: StorageKeys, value: string | null): Promise<void> {
    if (!value || value.length === 0) {
      localStorage.removeItem(`${key}`);
      return Promise.resolve();
    }

    localStorage.setItem(`${key}`, value);
    return Promise.resolve();
  }

  getStorage(key: StorageKeys): Promise<string | null> {
    const item = localStorage.getItem(`${key}`);
    return Promise.resolve(item);
  }
}

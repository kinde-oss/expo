import { DEFAULT_PLATFORM } from "../constants";
import { NativeStorageProvider } from "./nativeProvider";
import { IStorageProvider } from "./storageProvider.interface";
import { WebStorageProvider } from "./webProvider";

/**
 * Storage provider factory
 * @param {StorageKeys} platform Key to switch the storage provider
 * @returns {Promise<void>}
 */
export default function StorageProvider(
  platform: "web" | "native" | string = DEFAULT_PLATFORM
): IStorageProvider {
  switch (platform) {
    case "web":
      return new WebStorageProvider();
    default:
      return new NativeStorageProvider();
  }
}

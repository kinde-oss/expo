import { NativeStorageProvider } from "./nativeProvider";
import { IStorageProvider } from "./storageProvider.interface";
import { WebStorageProvider } from "./webProvider";

/**
 * Storage provider factory
 * @param {PlatformKeys} platform Key to switch the storage provider
 * @returns {Promise<void>}
 */
export default function StorageProvider(platform: string): IStorageProvider {
  switch (platform) {
    case "web":
      return new WebStorageProvider();
    default:
      return new NativeStorageProvider();
  }
}

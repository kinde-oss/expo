import { StorageKeys } from "../enums";

export interface IStorageProvider {
  /**
   * Sets item in the storage
   * @param {StorageKeys} key Key to store the value
   * @param {string} value value to store in the storage
   * @returns {Promise<void>}
   */
  setStorage(key: StorageKeys, value: string | null): Promise<void>;

  /**
   * Get item from the storage
   * @param {StorageKeys} key Key to retrieve
   * @returns {Promise<string | null>}
   */
  getStorage(key: StorageKeys): Promise<string | null>;
}

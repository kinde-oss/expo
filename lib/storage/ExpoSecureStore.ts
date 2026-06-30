import {
  SessionBase,
  StorageKeys,
  storageSettings,
  splitString,
} from "@kinde/js-utils";
import * as SecureStore from "expo-secure-store";

/**
 * Provides an Expo secure storage based session manager implementation.
 * @class ExpoSecureStore
 */
export class ExpoSecureStore<
  V extends string = StorageKeys,
> extends SessionBase<V> {
  asyncStore = true;

  /**
   * Clears all items from session store.
   * @returns {void}
   */
  async destroySession(): Promise<void> {
    const keys = Object.values(StorageKeys);
    await Promise.all(keys.map((key) => this.removeSessionItem(key)));

    this.notifyListeners();
  }

  /**
   * Sets the provided key-value store to ExpoSecureStore.
   * @param {string} itemKey
   * @param {unknown} itemValue
   * @returns {void}
   */
  async setSessionItem(
    itemKey: V | StorageKeys,
    itemValue: unknown,
  ): Promise<void> {
    await this.removeSessionItem(itemKey);

    if (typeof itemValue === "string") {
      const chunks = splitString(
        itemValue,
        Math.min(storageSettings.maxLength, 2048),
      );
      await Promise.all(
        chunks.map((splitValue, index) =>
          SecureStore.setItemAsync(
            `${storageSettings.keyPrefix}${itemKey}${index}`,
            splitValue,
          ),
        ),
      );
      this.notifyListeners();
      return;
    } else {
      throw new Error("Item value must be a string");
    }
  }

  /**
   * Gets the item for the provided key from the ExpoSecureStore.
   * @param {string} itemKey
   * @returns {unknown | null}
   */
  async getSessionItem(itemKey: V | StorageKeys): Promise<unknown | null> {
    const chunks = [];
    let index = 0;

    let chunk = await SecureStore.getItemAsync(
      `${storageSettings.keyPrefix}${String(itemKey)}${index}`,
    );

    while (chunk) {
      chunks.push(chunk);
      index++;

      chunk = await SecureStore.getItemAsync(
        `${storageSettings.keyPrefix}${String(itemKey)}${index}`,
      );
    }

    return chunks.join("") || null;
  }

  /**
   * Removes the item for the provided key from the ExpoSecureStore.
   * @param {string} itemKey
   * @returns {void}
   */
  async removeSessionItem(itemKey: V | StorageKeys): Promise<void> {
    let index = 0;

    let chunk = await SecureStore.getItemAsync(
      `${storageSettings.keyPrefix}${String(itemKey)}${index}`,
    );

    while (chunk) {
      await SecureStore.deleteItemAsync(
        `${storageSettings.keyPrefix}${String(itemKey)}${index}`,
      );
      index++;

      chunk = await SecureStore.getItemAsync(
        `${storageSettings.keyPrefix}${String(itemKey)}${index}`,
      );
    }

    this.notifyListeners();
  }
}

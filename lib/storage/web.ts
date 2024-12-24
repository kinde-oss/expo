import { StorageKeys } from "./index";
const setItem = localStorage.setItem;
const getItem = localStorage.getItem;
const removeItem = localStorage.removeItem;

/**
 * Sets item in the storage (WEB)
 * @param {StorageKeys} key Key to store the value
 * @param {string} value value to store in the storage
 * @returns {Promise<void>}
 */
export const setStorage = async (
  key: StorageKeys,
  value: string | null
): Promise<void> => {
  if (!value || value.length === 0) {
    removeItem(`${key}`);

    return Promise.resolve();
  }

  setItem(`${key}`, value);
  return Promise.resolve();
};

/**
 * Get item from the storage (WEB)
 * @param {StorageKeys} key Key to retrieve
 * @returns {Promise<string | null>}
 */
export const getStorage = async (key: StorageKeys): Promise<string | null> => {
  const item = getItem(`${key}`);

  return Promise.resolve(item);
};

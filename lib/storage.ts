import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

export enum StorageKeys {
  accessToken,
  idToken,
  state,
}

/**
 * Sets item in the storage
 * @param {StorageKeys} key Key to store the value
 * @param {string} value value to store in the storage
 * @returns {Promise<void>}
 */
export const setStorage = async (key: StorageKeys, value: string | null) => {
  if (!value) {
    let index = 0;
    let chunk = await getItemAsync(`${key}-${index}`);
    while (chunk) {
      await deleteItemAsync(`${key}-${index}`);
      index++;
      chunk = await getItemAsync(`${key}-${index}`);
    }
    return;
  }
  if (value.length > 2048) {
    const chunks = value.match(/.{1,2048}/g);
    if (chunks) {
      chunks.forEach(async (chunk, index) => {
        await setItemAsync(`${key}-${index}`, chunk);
      });
    }
  } else {
    await setItemAsync(`${key}-0`, value);
  }
};

/**
 * Get item from the storage
 * @param {StorageKeys} key Key to retrieve
 * @returns {Promise<string | null>}
 */
export const getStorage = async (key: StorageKeys): Promise<string | null> => {
  const chunks = [];
  let index = 0;
  let chunk = await getItemAsync(`${key}-${index}`);
  while (chunk) {
    chunks.push(chunk);
    index++;
    chunk = await getItemAsync(`${key}-${index}`);
  }
  return chunks.join("");
};

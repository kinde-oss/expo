import { deleteItemAsync, setItemAsync } from "expo-secure-store";

export enum StorageKeys {
  accessToken,
  idToken,
  state,
}

export const setStorage = async (key: StorageKeys, value: string | null) => {
  if (!value) {
    await deleteItemAsync(key.toString());
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

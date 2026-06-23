import {
  ExpoSecureStore,
  LocalStorage,
  MemoryStorage,
  SessionManager,
} from "@kinde/js-utils";
import { maybeCompleteAuthSession } from "expo-web-browser";

type WebWindowLike = {
  localStorage?: {
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
};

type StorageFactoryOptions = {
  platformOS: string;
  windowObject?: WebWindowLike;
  loadExpoSecureStore?: typeof ExpoSecureStore.default;
};

const STORAGE_TEST_KEY = "__kinde_storage_test__";

export const canUseLocalStorage = (windowObject?: WebWindowLike): boolean => {
  if (!windowObject?.localStorage) {
    return false;
  }

  try {
    windowObject.localStorage.setItem(STORAGE_TEST_KEY, "test");
    windowObject.localStorage.removeItem(STORAGE_TEST_KEY);
    return true;
  } catch {
    return false;
  }
};

export const completePendingWebAuthSession = (
  platformOS: string,
  windowObject?: unknown,
): void => {
  if (platformOS === "web" && typeof windowObject !== "undefined") {
    maybeCompleteAuthSession();
  }
};

export const createSessionStorage = async ({
  platformOS,
  windowObject,
  loadExpoSecureStore = ExpoSecureStore.default,
}: StorageFactoryOptions): Promise<SessionManager> => {
  if (platformOS === "web") {
    if (canUseLocalStorage(windowObject)) {
      return new LocalStorage();
    }

    console.warn(
      "[Kinde] localStorage is unavailable; using in-memory storage for this session.",
    );
    return new MemoryStorage();
  }

  const ExpoStore = await loadExpoSecureStore();
  return new ExpoStore();
};

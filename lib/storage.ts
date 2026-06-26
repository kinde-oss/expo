import {
  clearInsecureStorage,
  ExpoSecureStore,
  getInsecureStorage,
  LocalStorage,
  MemoryStorage,
  SessionManager,
  setInsecureStorage,
  StorageKeys,
  storageSettings,
} from "@kinde/js-utils";
import type { DiscoveryDocument } from "expo-auth-session";
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

type RemoteLogoutOptions = {
  discovery: Pick<DiscoveryDocument, "endSessionEndpoint"> | null;
  redirectUri: string;
  openAuthSession: (url: string, redirectUri: string) => Promise<unknown>;
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
  if (platformOS === "web" && windowObject != null) {
    maybeCompleteAuthSession();
  }
};

const resetInsecureStorage = (): void => {
  clearInsecureStorage();
  storageSettings.useInsecureForRefreshToken = false;
};

export const createSessionStorage = async ({
  platformOS,
  windowObject,
  loadExpoSecureStore = ExpoSecureStore.default,
}: StorageFactoryOptions): Promise<SessionManager> => {
  resetInsecureStorage();

  if (platformOS === "web") {
    const memoryStorage = new MemoryStorage();

    if (canUseLocalStorage(windowObject)) {
      // The provider passes the real browser window in production, and
      // @kinde/js-utils LocalStorage reads from the global localStorage.
      setInsecureStorage(new LocalStorage());
      storageSettings.useInsecureForRefreshToken = true;
      return memoryStorage;
    }

    console.warn(
      "[Kinde] localStorage is unavailable; using in-memory storage only for this session.",
    );
    return memoryStorage;
  }

  const ExpoStore = await loadExpoSecureStore();
  return new ExpoStore();
};

export const persistRefreshToken = async (
  storage: SessionManager,
  refreshToken: string | null | undefined,
): Promise<void> => {
  if (!refreshToken) {
    await clearPersistedRefreshToken(storage);
    return;
  }

  const insecureStorage = getInsecureStorage();
  if (storageSettings.useInsecureForRefreshToken && insecureStorage) {
    await insecureStorage.setSessionItem(
      StorageKeys.refreshToken,
      refreshToken,
    );
    return;
  }

  await storage.setSessionItem(StorageKeys.refreshToken, refreshToken);
};

export const clearPersistedRefreshToken = async (
  storage: SessionManager,
): Promise<void> => {
  await storage.removeSessionItem(StorageKeys.refreshToken);

  const insecureStorage = getInsecureStorage();
  if (insecureStorage && insecureStorage !== storage) {
    await insecureStorage.removeSessionItem(StorageKeys.refreshToken);
  }
};

export const performRemoteLogout = async ({
  discovery,
  redirectUri,
  openAuthSession,
}: RemoteLogoutOptions): Promise<void> => {
  if (discovery?.endSessionEndpoint) {
    const logoutUrl = new URL(discovery.endSessionEndpoint);
    logoutUrl.searchParams.set("redirect", redirectUri);
    await openAuthSession(logoutUrl.toString(), redirectUri);
  }
};

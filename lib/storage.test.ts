import {
  clearInsecureStorage,
  getInsecureStorage,
  LocalStorage,
  MemoryStorage,
  StorageKeys,
  storageSettings,
} from "@kinde/js-utils";
import { maybeCompleteAuthSession } from "expo-web-browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseLocalStorage,
  clearPersistedRefreshToken,
  completePendingWebAuthSession,
  createSessionStorage,
  performRemoteLogout,
  persistRefreshToken,
} from "./storage";

vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
}));

describe("storage helpers", () => {
  afterEach(() => {
    clearInsecureStorage();
    storageSettings.useInsecureForRefreshToken = false;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const installLocalStorageStub = () => {
    const values = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
    };

    vi.stubGlobal("localStorage", localStorage);
    return { localStorage, values };
  };

  it("detects working localStorage", () => {
    const localStorage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(canUseLocalStorage({ localStorage })).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "__kinde_storage_test__",
      "test",
    );
    expect(localStorage.removeItem).toHaveBeenCalledWith(
      "__kinde_storage_test__",
    );
  });

  it("rejects unavailable localStorage", () => {
    expect(canUseLocalStorage()).toBe(false);
  });

  it("rejects localStorage when the browser blocks access", () => {
    const localStorage = {
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      removeItem: vi.fn(),
    };

    expect(canUseLocalStorage({ localStorage })).toBe(false);
  });

  it("uses MemoryStorage as active web storage and LocalStorage only for insecure persistence", async () => {
    installLocalStorageStub();

    const storage = await createSessionStorage({
      platformOS: "web",
      windowObject: {
        localStorage: {
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    expect(storage).toBeInstanceOf(MemoryStorage);
    expect(getInsecureStorage()).toBeInstanceOf(LocalStorage);
    expect(storageSettings.useInsecureForRefreshToken).toBe(true);
  });

  it("falls back to MemoryStorage on web when browser storage is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const storage = await createSessionStorage({
      platformOS: "web",
      windowObject: {
        localStorage: {
          setItem: vi.fn(() => {
            throw new Error("blocked");
          }),
          removeItem: vi.fn(),
        },
      },
    });

    expect(storage).toBeInstanceOf(MemoryStorage);
    expect(getInsecureStorage()).toBeNull();
    expect(storageSettings.useInsecureForRefreshToken).toBe(false);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("persists refresh tokens to insecure storage when split web storage is enabled", async () => {
    installLocalStorageStub();

    const storage = await createSessionStorage({
      platformOS: "web",
      windowObject: {
        localStorage: {
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await persistRefreshToken(storage, "refresh-token");

    expect(await storage.getSessionItem(StorageKeys.refreshToken)).toBeNull();
    expect(
      await getInsecureStorage()?.getSessionItem(StorageKeys.refreshToken),
    ).toBe("refresh-token");
  });

  it("clears refresh tokens from insecure storage on web", async () => {
    installLocalStorageStub();

    const storage = await createSessionStorage({
      platformOS: "web",
      windowObject: {
        localStorage: {
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await persistRefreshToken(storage, "refresh-token");
    await clearPersistedRefreshToken(storage);

    expect(
      await getInsecureStorage()?.getSessionItem(StorageKeys.refreshToken),
    ).toBeNull();
    expect(await storage.getSessionItem(StorageKeys.refreshToken)).toBeNull();
  });

  it("persists refresh tokens to active storage when insecure storage is unavailable", async () => {
    const storage = await createSessionStorage({
      platformOS: "web",
      windowObject: {
        localStorage: {
          setItem: vi.fn(() => {
            throw new Error("blocked");
          }),
          removeItem: vi.fn(),
        },
      },
    });

    await persistRefreshToken(storage, "refresh-token");

    expect(await storage.getSessionItem(StorageKeys.refreshToken)).toBe(
      "refresh-token",
    );
    expect(getInsecureStorage()).toBeNull();
  });

  it("clears stale persisted refresh tokens when no new refresh token is issued", async () => {
    installLocalStorageStub();

    const storage = await createSessionStorage({
      platformOS: "web",
      windowObject: {
        localStorage: {
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    });

    await persistRefreshToken(storage, "refresh-token");
    await persistRefreshToken(storage, undefined);

    expect(
      await getInsecureStorage()?.getSessionItem(StorageKeys.refreshToken),
    ).toBeNull();
  });

  it("uses the Expo secure store loader on native platforms", async () => {
    class NativeStore extends MemoryStorage {}

    const loadExpoSecureStore = vi.fn(async () => NativeStore);

    const storage = await createSessionStorage({
      platformOS: "ios",
      loadExpoSecureStore,
    });

    expect(loadExpoSecureStore).toHaveBeenCalledOnce();
    expect(storage).toBeInstanceOf(NativeStore);
    expect(getInsecureStorage()).toBeNull();
    expect(storageSettings.useInsecureForRefreshToken).toBe(false);
  });

  it("completes pending auth sessions on web", () => {
    completePendingWebAuthSession("web", {});

    expect(maybeCompleteAuthSession).toHaveBeenCalledOnce();
  });

  it("does not complete auth sessions outside web", () => {
    completePendingWebAuthSession("ios", {});
    completePendingWebAuthSession("web", undefined);

    expect(maybeCompleteAuthSession).not.toHaveBeenCalled();
  });

  it("does not complete auth sessions when windowObject is null", () => {
    completePendingWebAuthSession("web", null);

    expect(maybeCompleteAuthSession).not.toHaveBeenCalled();
  });

  it("opens the remote logout session even when only persisted web state remains", async () => {
    const openAuthSession = vi.fn(async () => undefined);

    await performRemoteLogout({
      discovery: {
        endSessionEndpoint: "https://example.kinde.com/logout",
      },
      redirectUri: "myapp://callback",
      openAuthSession,
    });

    const logoutUrl = new URL(openAuthSession.mock.calls[0][0]);

    expect(logoutUrl.origin + logoutUrl.pathname).toBe(
      "https://example.kinde.com/logout",
    );
    expect(logoutUrl.searchParams.get("redirect")).toBe("myapp://callback");
    expect(openAuthSession).toHaveBeenCalledWith(
      expect.any(String),
      "myapp://callback",
    );
  });

  it("preserves existing logout query params while encoding the redirect URI", async () => {
    const openAuthSession = vi.fn(async () => undefined);

    await performRemoteLogout({
      discovery: {
        endSessionEndpoint: "https://example.kinde.com/logout?client=expo",
      },
      redirectUri: "myapp://callback?mode=web&return=/home",
      openAuthSession,
    });

    const logoutUrl = new URL(openAuthSession.mock.calls[0][0]);

    expect(logoutUrl.searchParams.get("client")).toBe("expo");
    expect(logoutUrl.searchParams.get("redirect")).toBe(
      "myapp://callback?mode=web&return=/home",
    );
    expect(openAuthSession).toHaveBeenCalledWith(
      expect.any(String),
      "myapp://callback?mode=web&return=/home",
    );
  });

  it("prioritizes hosted logout when discovery.endSessionEndpoint is present", async () => {
    const openAuthSession = vi.fn(async () => undefined);

    await performRemoteLogout({
      discovery: {
        endSessionEndpoint: "https://example.kinde.com/logout",
      },
      redirectUri: "myapp://callback",
      openAuthSession,
    });

    const logoutUrl = new URL(openAuthSession.mock.calls[0][0]);

    expect(logoutUrl.origin + logoutUrl.pathname).toBe(
      "https://example.kinde.com/logout",
    );
    expect(logoutUrl.searchParams.get("redirect")).toBe("myapp://callback");
    expect(openAuthSession).toHaveBeenCalledWith(
      expect.any(String),
      "myapp://callback",
    );
  });

  it("does nothing when no logout endpoint exists", async () => {
    const openAuthSession = vi.fn(async () => undefined);

    await performRemoteLogout({
      discovery: null,
      redirectUri: "myapp://callback",
      openAuthSession,
    });

    expect(openAuthSession).not.toHaveBeenCalled();
  });
});

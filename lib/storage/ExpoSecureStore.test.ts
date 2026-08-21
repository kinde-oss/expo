import { beforeEach, describe, expect, it, vi } from "vitest";
import { StorageKeys, storageSettings } from "@kinde/js-utils";
import { ExpoSecureStore } from "./ExpoSecureStore";

vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
}));

import * as SecureStore from "expo-secure-store";

const mockedSecureStore = vi.mocked(SecureStore);

describe("ExpoSecureStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("round-trips a token value with setSessionItem and getSessionItem", async () => {
    const store = new ExpoSecureStore();
    const token = "test-access-token";

    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(token);
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await store.setSessionItem(StorageKeys.accessToken, token);
    const result = await store.getSessionItem(StorageKeys.accessToken);

    expect(result).toBe(token);
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
      `${storageSettings.keyPrefix}${StorageKeys.accessToken}0`,
      token,
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
    );
  });

  it("returns null after removeSessionItem", async () => {
    const store = new ExpoSecureStore();
    const token = "test-access-token";

    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(token);
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await store.setSessionItem(StorageKeys.accessToken, token);

    mockedSecureStore.getItemAsync.mockResolvedValue(null);

    await store.removeSessionItem(StorageKeys.accessToken);
    const result = await store.getSessionItem(StorageKeys.accessToken);

    expect(result).toBeNull();
  });

  it("clears known keys on destroySession", async () => {
    const store = new ExpoSecureStore();

    mockedSecureStore.getItemAsync.mockResolvedValue(null);

    await store.destroySession();

    const keys = Object.values(StorageKeys);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(mockedSecureStore.getItemAsync).toHaveBeenCalledWith(
        `${storageSettings.keyPrefix}${key}0`,
      );
    }
  });

  it("throws when item value is not a string without removing existing data", async () => {
    const store = new ExpoSecureStore();
    const token = "existing-token";

    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(token);
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await store.setSessionItem(StorageKeys.accessToken, token);

    vi.clearAllMocks();

    await expect(
      store.setSessionItem(StorageKeys.accessToken, 123),
    ).rejects.toThrow("Item value must be a string");

    expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("chunks long strings into multiple setItemAsync calls with indexed keys", async () => {
    const store = new ExpoSecureStore();
    const chunkSize = Math.min(storageSettings.maxLength, 2048);
    const longValue = "a".repeat(chunkSize + 1);

    mockedSecureStore.getItemAsync.mockResolvedValue(null);

    await store.setSessionItem(StorageKeys.accessToken, longValue);

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledTimes(2);
    expect(mockedSecureStore.setItemAsync).toHaveBeenNthCalledWith(
      1,
      `${storageSettings.keyPrefix}${StorageKeys.accessToken}0`,
      "a".repeat(chunkSize),
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
    );
    expect(mockedSecureStore.setItemAsync).toHaveBeenNthCalledWith(
      2,
      `${storageSettings.keyPrefix}${StorageKeys.accessToken}1`,
      "a",
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
    );
  });

  it("preserves empty-string chunks when reading and deleting", async () => {
    const store = new ExpoSecureStore();

    mockedSecureStore.getItemAsync
      .mockResolvedValueOnce("hello")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("world")
      .mockResolvedValueOnce(null);

    const result = await store.getSessionItem(StorageKeys.accessToken);
    expect(result).toBe("helloworld");

    mockedSecureStore.getItemAsync
      .mockResolvedValueOnce("hello")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("world")
      .mockResolvedValueOnce(null);

    await store.removeSessionItem(StorageKeys.accessToken);

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the keychain is unreadable during cleanup", async () => {
    const store = new ExpoSecureStore();

    // Simulates iOS refusing to read a WHEN_UNLOCKED item while the device is
    // locked. The cleanup read must propagate so no chunk is deleted or
    // overwritten, leaving the existing token intact.
    mockedSecureStore.getItemAsync.mockRejectedValueOnce(
      new Error("User interaction is not allowed."),
    );

    await expect(
      store.setSessionItem(StorageKeys.accessToken, "new-token"),
    ).rejects.toThrow("User interaction is not allowed.");

    expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("fails closed when a later chunk is unreadable during cleanup", async () => {
    const store = new ExpoSecureStore();

    // Chunk 0 reads fine, then the keychain locks before chunk 1. Nothing may
    // be deleted, or the surviving value would be missing its first chunk and
    // leave stale chunks behind for the next write to glue onto.
    mockedSecureStore.getItemAsync
      .mockResolvedValueOnce("chunk-0")
      .mockRejectedValueOnce(new Error("User interaction is not allowed."));

    await expect(
      store.setSessionItem(StorageKeys.accessToken, "new-token"),
    ).rejects.toThrow("User interaction is not allowed.");

    expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

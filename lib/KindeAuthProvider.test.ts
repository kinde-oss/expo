import * as React from "react";
import type { AuthSessionResult } from "expo-auth-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KindeAuthProvider } from "./KindeAuthProvider";
import type { UserProfile } from "./types";

type ProviderCallbacks = NonNullable<
  Parameters<typeof KindeAuthProvider>[0]["callbacks"]
>;

const authSuccessResult = (
  params: Record<string, string> = { code: "authorization-code" },
): AuthSessionResult => ({
  type: "success",
  params,
  url: `kinde://redirect?code=${params.code ?? ""}`,
  errorCode: null,
  authentication: null,
});

const silentAuthOAuthErrorResult = (): AuthSessionResult => ({
  type: "error",
  params: {
    error: "login_required",
    error_description: "Silent authentication requires user interaction",
  },
  url: "kinde://redirect?error=login_required&error_description=Silent%20authentication%20requires%20user%20interaction",
  errorCode: "login_required",
  authentication: null,
});

const userCancelledAuthResult = (): AuthSessionResult => ({
  type: "cancel",
});

const mocked = vi.hoisted(() => ({
  clearInsecureStorage: vi.fn(),
  exchangeCodeAsync: vi.fn(async () => ({
    accessToken: "access-token",
    idToken: "id-token",
  })),
  getInsecureStorage: vi.fn(() => null),
  getUserProfile: vi.fn(async (): Promise<UserProfile | null> => null),
  makeRedirectUri: vi.fn(() => "kinde://redirect"),
  mapLoginMethodParamsForUrl: vi.fn(() => ({})),
  maybeCompleteAuthSession: vi.fn(),
  promptAsync: vi.fn(async (): Promise<AuthSessionResult> =>
    authSuccessResult(),
  ),
  openAuthSessionAsync: vi.fn(async (url: string) => ({
    type: "success" as const,
    url,
  })),
  removeSessionItem: vi.fn(async () => undefined),
  refreshToken: vi.fn(async () => ({ success: false })),
  setInsecureStorage: vi.fn(),
  setRefreshTimer: vi.fn(),
  storageSettings: { useInsecureForRefreshToken: false },
  validateToken: vi.fn(async () => ({ valid: true })),
}));

const SWITCH_ORG_SILENT_AUTH_TIMEOUT_MS = 30_000;
const SWITCH_ORG_SILENT_AUTH_TIMEOUT_MESSAGE =
  "Organization switch timed out waiting for silent authentication. Your identity provider session may be stale.";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useCallback: vi.fn((callback) => callback),
    useEffect: vi.fn(),
    useMemo: vi.fn((factory) => factory()),
    useState: vi.fn(),
  };
});

vi.mock("expo-auth-session", () => ({
  AuthRequest: class {
    codeVerifier: string | undefined;

    constructor(_config: unknown) {}

    async promptAsync(...args: unknown[]) {
      return mocked.promptAsync(
        ...(args as Parameters<typeof mocked.promptAsync>),
      );
    }
  },
  exchangeCodeAsync: mocked.exchangeCodeAsync,
  makeRedirectUri: mocked.makeRedirectUri,
}));

vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: mocked.maybeCompleteAuthSession,
  openAuthSessionAsync: mocked.openAuthSessionAsync,
  openBrowserAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: {
    OS: "web",
  },
}));

vi.mock("@kinde/jwt-validator", () => ({
  validateToken: mocked.validateToken,
}));

vi.mock("@kinde/jwt-decoder", () => ({
  jwtDecoder: vi.fn(),
}));

vi.mock("base-64", () => ({
  decode: vi.fn((value: string) => value),
  encode: vi.fn((value: string) => value),
}));

vi.mock("./storage/ExpoSecureStore", () => ({
  ExpoSecureStore: vi.fn(
    class {
      async getSessionItem() {
        return null;
      }

      async removeItems() {}

      async setSessionItem() {}
    },
  ),
}));

vi.mock("@kinde/js-utils", () => ({
  PortalPage: {
    profile: "profile",
  },
  PromptTypes: {
    create: "create",
    login: "login",
    none: "none",
  },
  RefreshType: {
    cookie: 1,
    refreshToken: 0,
  },
  StorageKeys: {
    accessToken: "access_token",
    idToken: "id_token",
    refreshToken: "refresh_token",
  },
  generatePortalUrl: vi.fn(async () => ({
    url: new URL("https://example.com"),
  })),
  getClaim: vi.fn(),
  getClaims: vi.fn(),
  getCurrentOrganization: vi.fn(),
  getFlag: vi.fn(),
  getInsecureStorage: mocked.getInsecureStorage,
  getRoles: vi.fn(),
  getUserOrganizations: vi.fn(),
  getUserProfile: mocked.getUserProfile,
  mapLoginMethodParamsForUrl: mocked.mapLoginMethodParamsForUrl,
  LocalStorage: class {},
  MemoryStorage: class {},
  refreshToken: mocked.refreshToken,
  clearInsecureStorage: mocked.clearInsecureStorage,
  setActiveStorage: vi.fn(),
  setInsecureStorage: mocked.setInsecureStorage,
  setRefreshTimer: mocked.setRefreshTimer,
  storageSettings: mocked.storageSettings,
}));

const configureProviderState = (storage: {
  getSessionItem: ReturnType<typeof vi.fn>;
  removeSessionItem: ReturnType<typeof vi.fn>;
  removeItems: ReturnType<typeof vi.fn>;
  setSessionItem: ReturnType<typeof vi.fn>;
}) => {
  const useStateMock = React.useState as unknown as ReturnType<typeof vi.fn>;

  useStateMock.mockReset();
  useStateMock
    .mockImplementationOnce(() => [false, vi.fn()])
    .mockImplementationOnce(() => [true, vi.fn()])
    .mockImplementationOnce(() => [storage, vi.fn()])
    .mockImplementationOnce(() => [true, vi.fn()]);
};

const mockUser: UserProfile = {
  id: "user-1",
  email: "test@example.com",
};

const createStorage = () => ({
  getSessionItem: vi.fn(async () => null),
  removeSessionItem: vi.fn(async () => undefined),
  removeItems: vi.fn(async () => undefined),
  setSessionItem: vi.fn(async () => undefined),
});

const createProvider = async (callbacks?: {
  onError?: ReturnType<typeof vi.fn>;
  onEvent?: ReturnType<typeof vi.fn>;
  onSuccess?: ReturnType<typeof vi.fn>;
}) => {
  const storage = createStorage();

  configureProviderState(storage);

  const { KindeAuthProvider } = await import("./KindeAuthProvider");
  const providerElement = KindeAuthProvider({
    callbacks: callbacks as ProviderCallbacks | undefined,
    children: null,
    config: {
      clientId: "client-id",
      domain: "https://example.kinde.com",
    },
  });

  return {
    storage,
    switchOrg: (
      providerElement as {
        props: {
          value: {
            switchOrg: (
              orgCode: string,
              options?: { redirectURL?: string },
            ) => Promise<unknown>;
          };
        };
      }
    ).props.value.switchOrg,
  };
};

describe("KindeAuthProvider Expo SDK 56 migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    mocked.getInsecureStorage.mockReturnValue(null);
    mocked.storageSettings.useInsecureForRefreshToken = false;
  });

  it("completes pending web auth sessions when the module loads", async () => {
    vi.stubGlobal("window", {});

    await import("./KindeAuthProvider");

    expect(mocked.maybeCompleteAuthSession).toHaveBeenCalledTimes(1);
  });

  it("skips pending web auth completion during import when no browser window exists", async () => {
    await import("./KindeAuthProvider");

    expect(mocked.maybeCompleteAuthSession).not.toHaveBeenCalled();
  });

  it("uses Expo-managed redirect inference instead of a manual native flag", async () => {
    const storage = {
      getSessionItem: vi.fn(async () => null),
      removeSessionItem: vi.fn(async () => undefined),
      removeItems: vi.fn(async () => undefined),
      setSessionItem: vi.fn(async () => undefined),
    };

    configureProviderState(storage);

    const { KindeAuthProvider } = await import("./KindeAuthProvider");

    KindeAuthProvider({
      callbacks: undefined,
      children: null,
      config: {
        clientId: "client-id",
        domain: "https://example.kinde.com",
      },
    });

    expect(mocked.makeRedirectUri).toHaveBeenCalledTimes(1);
    expect(mocked.makeRedirectUri).toHaveBeenCalledWith();
  });

  it("does not schedule token refreshes when the code exchange omits a refresh token", async () => {
    const storage = {
      getSessionItem: vi.fn(async () => null),
      removeSessionItem: vi.fn(async () => undefined),
      removeItems: vi.fn(async () => undefined),
      setSessionItem: vi.fn(async () => undefined),
    };

    configureProviderState(storage);

    const { KindeAuthProvider } = await import("./KindeAuthProvider");
    const providerElement = KindeAuthProvider({
      callbacks: undefined,
      children: null,
      config: {
        clientId: "client-id",
        domain: "https://example.kinde.com",
      },
    });

    const login = (
      providerElement as {
        props: { value: { login: (args?: unknown) => Promise<unknown> } };
      }
    ).props.value.login;

    await login();

    expect(storage.setSessionItem).toHaveBeenCalledTimes(2);
    expect(storage.setSessionItem).not.toHaveBeenCalledWith(
      "refresh_token",
      expect.anything(),
    );
    expect(storage.removeSessionItem).toHaveBeenCalledWith("refresh_token");
    expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
  });

  it("prioritizes Kinde hosted logout when revokeToken is requested", async () => {
    const storage = {
      getSessionItem: vi.fn(async (key: string) =>
        key === "access_token" ? "access-token" : null,
      ),
      removeSessionItem: vi.fn(async () => undefined),
      removeItems: vi.fn(async () => undefined),
      setSessionItem: vi.fn(async () => undefined),
    };

    configureProviderState(storage);

    const { KindeAuthProvider } = await import("./KindeAuthProvider");
    const providerElement = KindeAuthProvider({
      callbacks: undefined,
      children: null,
      config: {
        clientId: "client-id",
        domain: "https://example.kinde.com",
      },
    });

    const logout = (
      providerElement as {
        props: {
          value: {
            logout: (args?: unknown) => Promise<unknown>;
          };
        };
      }
    ).props.value.logout;

    await logout({ revokeToken: true });

    const logoutUrl = new URL(mocked.openAuthSessionAsync.mock.calls[0][0]);

    expect(logoutUrl.origin + logoutUrl.pathname).toBe(
      "https://example.kinde.com/logout",
    );
    expect(logoutUrl.searchParams.get("redirect")).toBe("kinde://redirect");
    expect(mocked.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.any(String),
      "kinde://redirect",
    );
  });
});

describe("KindeAuthProvider switchOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocked.getUserProfile.mockResolvedValue(mockUser);
    mocked.promptAsync.mockResolvedValue(authSuccessResult());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes silently when prompt none succeeds", async () => {
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const { switchOrg } = await createProvider({
      onError,
      onEvent,
      onSuccess,
    });

    const result = await switchOrg("org_abc");

    expect(result).toEqual({
      success: true,
      accessToken: "access-token",
      idToken: "id-token",
    });
    expect(mocked.promptAsync).toHaveBeenCalledTimes(1);
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        orgCode: "org_abc",
        prompt: "none",
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      mockUser,
      {},
      expect.objectContaining({ switchOrg: expect.any(Function) }),
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      "switchOrg",
      expect.objectContaining({ success: true }),
      expect.objectContaining({ switchOrg: expect.any(Function) }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("returns failure without interactive retry when silent auth returns an OAuth error", async () => {
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();

    mocked.promptAsync.mockResolvedValueOnce(silentAuthOAuthErrorResult());

    const { switchOrg } = await createProvider({
      onError,
      onEvent,
      onSuccess,
    });

    const result = await switchOrg("org_abc");

    expect(result).toEqual({
      success: false,
      errorMessage: "Unknown error",
    });
    expect(mocked.promptAsync).toHaveBeenCalledTimes(1);
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenCalledTimes(1);
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        orgCode: "org_abc",
        prompt: "none",
      }),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      {
        error: "ERR_LOGIN",
        errorDescription: "Unknown error",
      },
      {},
      expect.objectContaining({ switchOrg: expect.any(Function) }),
    );
    expect(onError).not.toHaveBeenCalledWith(
      expect.objectContaining({
        errorDescription: SWITCH_ORG_SILENT_AUTH_TIMEOUT_MESSAGE,
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("falls back to interactive login after silent timeout and fires callbacks once", async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();

    mocked.promptAsync.mockImplementationOnce(() => new Promise(() => {}));
    mocked.promptAsync.mockResolvedValueOnce(authSuccessResult());

    const { switchOrg } = await createProvider({
      onError,
      onEvent,
      onSuccess,
    });
    const switchOrgPromise = switchOrg("org_abc");

    await vi.advanceTimersByTimeAsync(SWITCH_ORG_SILENT_AUTH_TIMEOUT_MS);
    const result = await switchOrgPromise;

    expect(result).toEqual({
      success: true,
      accessToken: "access-token",
      idToken: "id-token",
    });
    expect(mocked.promptAsync).toHaveBeenCalledTimes(2);
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orgCode: "org_abc",
        prompt: "none",
      }),
    );
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orgCode: "org_abc",
        prompt: "login",
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      "switchOrg",
      expect.objectContaining({ success: true }),
      expect.anything(),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports error when interactive fallback is cancelled after silent timeout", async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();

    mocked.promptAsync.mockImplementationOnce(() => new Promise(() => {}));
    mocked.promptAsync.mockResolvedValueOnce(userCancelledAuthResult());

    const { switchOrg } = await createProvider({
      onError,
      onEvent,
      onSuccess,
    });
    const switchOrgPromise = switchOrg("org_abc");

    await vi.advanceTimersByTimeAsync(SWITCH_ORG_SILENT_AUTH_TIMEOUT_MS);
    const result = await switchOrgPromise;

    expect(result).toEqual({
      success: false,
      errorMessage: "Unknown error",
    });
    expect(mocked.promptAsync).toHaveBeenCalledTimes(2);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      {
        error: "ERR_LOGIN",
        errorDescription: "Unknown error",
      },
      {},
      expect.objectContaining({ switchOrg: expect.any(Function) }),
    );
    expect(onError).not.toHaveBeenCalledWith(
      expect.objectContaining({
        errorDescription: SWITCH_ORG_SILENT_AUTH_TIMEOUT_MESSAGE,
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exchangeCodeAsync: vi.fn(async () => ({
    accessToken: "access-token",
    idToken: "id-token",
  })),
  getUserProfile: vi.fn(async () => null),
  makeRedirectUri: vi.fn(() => "kinde://redirect"),
  mapLoginMethodParamsForUrl: vi.fn(() => ({})),
  maybeCompleteAuthSession: vi.fn(),
  promptAsync: vi.fn(async () => ({
    type: "success" as const,
    params: { code: "authorization-code" },
  })),
  refreshToken: vi.fn(async () => ({ success: false })),
  setRefreshTimer: vi.fn(),
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
      return mocked.promptAsync(...args);
    }
  },
  exchangeCodeAsync: mocked.exchangeCodeAsync,
  makeRedirectUri: mocked.makeRedirectUri,
  revokeAsync: vi.fn(),
  TokenTypeHint: {
    AccessToken: "access_token",
    RefreshToken: "refresh_token",
  },
}));

vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: mocked.maybeCompleteAuthSession,
  openAuthSessionAsync: vi.fn(),
  openBrowserAsync: vi.fn(),
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

vi.mock("@kinde/js-utils", () => ({
  ExpoSecureStore: {
    default: vi.fn(
      async () =>
        class {
          async getSessionItem() {
            return null;
          }

          async removeItems() {}

          async setSessionItem() {}
        },
    ),
  },
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
  getRoles: vi.fn(),
  getUserOrganizations: vi.fn(),
  getUserProfile: mocked.getUserProfile,
  mapLoginMethodParamsForUrl: mocked.mapLoginMethodParamsForUrl,
  refreshToken: mocked.refreshToken,
  setActiveStorage: vi.fn(),
  setRefreshTimer: mocked.setRefreshTimer,
}));

const configureProviderState = (storage: {
  getSessionItem: ReturnType<typeof vi.fn>;
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

const mockUser = {
  id: "user-1",
  email: "test@example.com",
};

const createStorage = () => ({
  getSessionItem: vi.fn(async () => null),
  removeItems: vi.fn(async () => undefined),
  setSessionItem: vi.fn(async () => undefined),
});

const createProvider = async (
  callbacks?: {
    onError?: ReturnType<typeof vi.fn>;
    onEvent?: ReturnType<typeof vi.fn>;
    onSuccess?: ReturnType<typeof vi.fn>;
  },
) => {
  const storage = createStorage();

  configureProviderState(storage);

  const { KindeAuthProvider } = await import("./KindeAuthProvider");
  const providerElement = KindeAuthProvider({
    callbacks,
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
    vi.resetModules();
  });

  it("completes pending web auth sessions when the module loads", async () => {
    await import("./KindeAuthProvider");

    expect(mocked.maybeCompleteAuthSession).toHaveBeenCalledTimes(1);
  });

  it("uses Expo-managed redirect inference instead of a manual native flag", async () => {
    const storage = {
      getSessionItem: vi.fn(async () => null),
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
    const storage = createStorage();

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
    expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
  });
});

describe("KindeAuthProvider switchOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocked.getUserProfile.mockResolvedValue(mockUser);
    mocked.promptAsync.mockResolvedValue({
      type: "success",
      params: { code: "authorization-code" },
    });
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

  it("falls back to interactive login after silent timeout and fires callbacks once", async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();

    mocked.promptAsync.mockImplementationOnce(() => new Promise(() => {}));
    mocked.promptAsync.mockResolvedValueOnce({
      type: "success",
      params: { code: "authorization-code" },
    });

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

  it("reports error when interactive fallback fails after silent timeout", async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();

    mocked.promptAsync.mockImplementationOnce(() => new Promise(() => {}));
    mocked.promptAsync.mockResolvedValueOnce({
      type: "cancel",
      params: {},
    });

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

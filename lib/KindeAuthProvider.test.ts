import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exchangeCodeAsync: vi.fn(async () => ({
    accessToken: "access-token",
    idToken: "id-token",
  })),
  getUserProfile: vi.fn(async () => null),
  makeRedirectUri: vi.fn(() => "kinde://redirect"),
  maybeCompleteAuthSession: vi.fn(),
  refreshToken: vi.fn(async () => ({ success: false })),
  setRefreshTimer: vi.fn(),
  validateToken: vi.fn(async () => ({ valid: true })),
}));

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

    async promptAsync() {
      return {
        type: "success" as const,
        params: { code: "authorization-code" },
      };
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
  mapLoginMethodParamsForUrl: vi.fn(() => ({})),
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
    const storage = {
      getSessionItem: vi.fn(async () => null),
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
    expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
  });
});

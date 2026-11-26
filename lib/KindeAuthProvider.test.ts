import * as React from "react";
import type {
  AuthError,
  AuthRequestConfig,
  AuthRequestPromptOptions,
  AuthSessionResult,
  TokenResponse,
} from "expo-auth-session";
import {
  StorageKeys,
  type AuthenticationContext,
  type AuthenticationContextRequirement,
  type LoginMethodParams,
  type SessionManager,
} from "@kinde/js-utils";
import { jwtDecoder } from "@kinde/jwt-decoder";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KindeAuthProvider } from "./KindeAuthProvider";
import type { StepUpOptions, UserProfile } from "./types";
import type { KindeAuthHook } from "./useKindeAuth";

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

const authOAuthErrorResult = (
  code: string,
  params: Record<string, string> = {},
): AuthSessionResult => {
  const callbackParams = {
    error: code,
    error_description: "Extra verification could not be completed",
    state: "expo-state",
    ...params,
  };
  const error: AuthError = Object.assign(
    new Error(callbackParams.error_description),
    {
      name: "AuthError",
      code,
      description: callbackParams.error_description,
      params: callbackParams,
      state: callbackParams.state,
    },
  );

  return {
    type: "error",
    error,
    params: callbackParams,
    url: `kinde://redirect?${new URLSearchParams(callbackParams)}`,
    errorCode: null,
    authentication: null,
  };
};

const userCancelledAuthResult = (): AuthSessionResult => ({
  type: "cancel",
});

const mocked = vi.hoisted(() => ({
  authRequest: vi.fn(),
  clearInsecureStorage: vi.fn(),
  getAuthenticationContext: vi.fn(
    async (_domain: string): Promise<AuthenticationContext | null> => null,
  ),
  getAuthRequestConfigAsync: vi.fn(async () => ({
    state: "expo-state",
    codeChallenge: "expo-challenge",
    codeChallengeMethod: "S256" as const,
  })),
  hasAuthenticationContext: vi.fn(
    async (_requirement: AuthenticationContextRequirement, _domain: string) =>
      false,
  ),
  isStepUpSupported: vi.fn(async (_domain: string) => true),
  stepUp: vi.fn(async (_domain: string, _options: unknown) => ({
    url: new URL(
      "https://example.kinde.com/oauth2/auth?acr_values=mfa&state=expo-state",
    ),
    state: "expo-state",
    nonce: "shared-nonce",
    codeChallenge: "expo-challenge",
    codeVerifier: "shared-verifier",
  })),
  exchangeCodeAsync: vi.fn(
    async (): Promise<
      Partial<Pick<TokenResponse, "accessToken" | "idToken" | "refreshToken">>
    > => ({
      accessToken: "access-token",
      idToken: "id-token",
    }),
  ),
  getInsecureStorage: vi.fn<() => SessionManager | null>(() => null),
  getUserProfile: vi.fn(async (): Promise<UserProfile | null> => null),
  makeRedirectUri: vi.fn(() => "kinde://redirect"),
  mapLoginMethodParamsForUrl: vi.fn(
    (_options: Partial<LoginMethodParams>) => ({}),
  ),
  maybeCompleteAuthSession: vi.fn(),
  randomUUID: vi.fn(() => "2e53b83c-a7ad-4d7f-a83c-df251f9f721e"),
  promptAsync: vi.fn(
    async (
      _discovery: unknown,
      _options: AuthRequestPromptOptions,
    ): Promise<AuthSessionResult> => authSuccessResult(),
  ),
  openAuthSessionAsync: vi.fn(async (url: string) => ({
    type: "success" as const,
    url,
  })),
  removeSessionItem: vi.fn(async () => undefined),
  refreshToken: vi.fn(async () => ({ success: false })),
  revokeAsync: vi.fn(async () => true),
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
    useContext: vi.fn(),
    useEffect: vi.fn(),
    useMemo: vi.fn((factory) => factory()),
    useState: vi.fn(),
  };
});

vi.mock("expo-auth-session", () => ({
  AuthRequest: class {
    state = "expo-state";
    codeVerifier: string | undefined;

    constructor(private readonly config: AuthRequestConfig) {
      mocked.authRequest(config);
    }

    async makeAuthUrlAsync({
      authorizationEndpoint,
    }: {
      authorizationEndpoint: string;
    }) {
      const params = new URLSearchParams({
        ...this.config.extraParams,
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        response_type: this.config.responseType ?? "code",
        state: this.state,
        code_challenge: "expo-challenge",
        code_challenge_method: "S256",
      });
      if (this.config.scopes?.length) {
        params.set("scope", this.config.scopes.join(" "));
      }
      return `${authorizationEndpoint}?${params}`;
    }

    async getAuthRequestConfigAsync() {
      this.codeVerifier = "expo-verifier";
      return mocked.getAuthRequestConfigAsync();
    }

    async promptAsync(...args: unknown[]) {
      return mocked.promptAsync(
        ...(args as Parameters<typeof mocked.promptAsync>),
      );
    }
  },
  exchangeCodeAsync: mocked.exchangeCodeAsync,
  makeRedirectUri: mocked.makeRedirectUri,
  revokeAsync: mocked.revokeAsync,
  TokenTypeHint: {
    AccessToken: "access_token",
    RefreshToken: "refresh_token",
  },
}));

vi.mock("expo-crypto", () => ({ randomUUID: mocked.randomUUID }));

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

vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
    },
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  };
});

vi.mock("@kinde/js-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kinde/js-utils")>();

  return {
    UnmetAuthenticationRequirementsError:
      actual.UnmetAuthenticationRequirementsError,
    LoginRequiredError: actual.LoginRequiredError,
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
    StorageKeys: actual.StorageKeys,
    generatePortalUrl: vi.fn(async () => ({
      url: new URL("https://example.com"),
    })),
    getAuthenticationContext: mocked.getAuthenticationContext,
    hasAuthenticationContext: mocked.hasAuthenticationContext,
    isStepUpSupported: mocked.isStepUpSupported,
    stepUp: mocked.stepUp,
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
    SessionBase: actual.SessionBase,
    splitString: actual.splitString,
    storageSettings: Object.assign(mocked.storageSettings, {
      keyPrefix: actual.storageSettings.keyPrefix,
      maxLength: actual.storageSettings.maxLength,
    }),
    withTokenSessionLock: vi.fn(actual.withTokenSessionLock),
  };
});

const configureProviderState = (
  storage: Pick<
    SessionManager,
    "getSessionItem" | "removeSessionItem" | "removeItems" | "setSessionItem"
  >,
) => {
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
  getSessionItem: vi.fn(async (): Promise<string | null> => null),
  removeSessionItem: vi.fn(async () => undefined),
  removeItems: vi.fn(async () => undefined),
  setSessionItem: vi.fn(async () => undefined),
});

const createProvider = async (
  callbacks?: {
    onError?: ReturnType<typeof vi.fn>;
    onEvent?: ReturnType<typeof vi.fn>;
    onSuccess?: ReturnType<typeof vi.fn>;
  },
  config: Partial<Parameters<typeof KindeAuthProvider>[0]["config"]> = {},
) => {
  const storage = createStorage();

  configureProviderState(storage);

  const { KindeAuthProvider } = await import("./KindeAuthProvider");
  const providerElement = KindeAuthProvider({
    callbacks: callbacks as ProviderCallbacks | undefined,
    children: null,
    config: {
      clientId: "client-id",
      domain: "https://example.kinde.com",
      ...config,
    },
  });
  const auth = (providerElement as { props: { value: KindeAuthHook } }).props
    .value;

  return {
    storage,
    auth,
    switchOrg: auth.switchOrg,
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
      StorageKeys.refreshToken,
      expect.anything(),
    );
    expect(storage.removeSessionItem).toHaveBeenCalledWith(
      StorageKeys.refreshToken,
    );
    expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
  });

  it("forwards config.browserOptions to the login auth session", async () => {
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
        browserOptions: { preferEphemeralSession: true },
      },
    });

    const login = (
      providerElement as {
        props: { value: { login: (args?: unknown) => Promise<unknown> } };
      }
    ).props.value.login;

    await login();

    expect(mocked.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationEndpoint: "https://example.kinde.com/oauth2/auth",
      }),
      expect.objectContaining({
        showInRecents: true,
        preferEphemeralSession: true,
      }),
    );
  });

  it("revokes tokens and performs hosted logout when revokeToken is requested", async () => {
    const storage = {
      getSessionItem: vi.fn(async (key: string) => {
        if (key === StorageKeys.accessToken) return "access-token";
        if (key === StorageKeys.refreshToken) return "refresh-token";
        return null;
      }),
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

    // Verify token revocation was called for both access and refresh tokens
    expect(mocked.revokeAsync).toHaveBeenCalledTimes(2);
    expect(mocked.revokeAsync).toHaveBeenCalledWith(
      {
        clientId: "client-id",
        token: "access-token",
        tokenTypeHint: "access_token",
      },
      expect.any(Object),
    );
    expect(mocked.revokeAsync).toHaveBeenCalledWith(
      {
        clientId: "client-id",
        token: "refresh-token",
        tokenTypeHint: "refresh_token",
      },
      expect.any(Object),
    );

    // Verify hosted logout was still called correctly
    expect(logoutUrl.origin + logoutUrl.pathname).toBe(
      "https://example.kinde.com/logout",
    );
    expect(logoutUrl.searchParams.get("redirect")).toBe("kinde://redirect");
    expect(mocked.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.any(String),
      "kinde://redirect",
      {},
    );
  });

  it("forwards config.browserOptions to the hosted logout auth session", async () => {
    const storage = {
      getSessionItem: vi.fn(async (key: string) =>
        key === StorageKeys.accessToken ? "access-token" : null,
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
        browserOptions: { preferEphemeralSession: true },
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

    await logout();

    expect(mocked.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.any(String),
      "kinde://redirect",
      { preferEphemeralSession: true },
    );
  });

  it("lets a per-call browserOptions override the login default", async () => {
    const storage = createStorage();

    configureProviderState(storage);

    const { KindeAuthProvider } = await import("./KindeAuthProvider");
    const providerElement = KindeAuthProvider({
      callbacks: undefined,
      children: null,
      config: {
        clientId: "client-id",
        domain: "https://example.kinde.com",
        browserOptions: { preferEphemeralSession: false },
      },
    });

    const login = (
      providerElement as {
        props: {
          value: {
            login: (
              options?: unknown,
              browserOptions?: unknown,
            ) => Promise<unknown>;
          };
        };
      }
    ).props.value.login;

    await login({}, { preferEphemeralSession: true });

    expect(mocked.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationEndpoint: "https://example.kinde.com/oauth2/auth",
      }),
      expect.objectContaining({ preferEphemeralSession: true }),
    );
  });

  it("forwards a per-call browserOptions from register", async () => {
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

    const register = (
      providerElement as {
        props: {
          value: {
            register: (
              options?: unknown,
              browserOptions?: unknown,
            ) => Promise<unknown>;
          };
        };
      }
    ).props.value.register;

    await register({}, { preferEphemeralSession: true });

    expect(mocked.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationEndpoint: "https://example.kinde.com/oauth2/auth",
      }),
      expect.objectContaining({ preferEphemeralSession: true }),
    );
  });

  it("lets a per-call browserOptions override the logout default", async () => {
    const storage = {
      getSessionItem: vi.fn(async (key: string) =>
        key === StorageKeys.accessToken ? "access-token" : null,
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
        browserOptions: { preferEphemeralSession: false },
      },
    });

    const logout = (
      providerElement as {
        props: {
          value: {
            logout: (
              options?: unknown,
              browserOptions?: unknown,
            ) => Promise<unknown>;
          };
        };
      }
    ).props.value.logout;

    await logout({}, { preferEphemeralSession: true });

    expect(mocked.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.any(String),
      "kinde://redirect",
      { preferEphemeralSession: true },
    );
  });
});

describe("KindeAuthProvider step-up consumer API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocked.getInsecureStorage.mockReturnValue(null);
    mocked.storageSettings.useInsecureForRefreshToken = false;
    mocked.getUserProfile.mockResolvedValue(mockUser);
    mocked.promptAsync.mockResolvedValue(authSuccessResult());
    mocked.getAuthenticationContext.mockResolvedValue(null);
    mocked.hasAuthenticationContext.mockResolvedValue(false);
    mocked.isStepUpSupported.mockResolvedValue(true);
  });

  it("exposes step-up and authentication-context methods through useKindeAuth", async () => {
    const { auth } = await createProvider();
    const { KindeAuthContext } = await import("./KindeAuthProvider");
    const { useKindeAuth } = await import("./useKindeAuth");
    vi.mocked(React.useContext).mockReturnValue(auth);

    expect(useKindeAuth()).toBe(auth);
    expect(React.useContext).toHaveBeenCalledWith(KindeAuthContext);
    expect(auth).toEqual(
      expect.objectContaining({
        stepUp: expect.any(Function),
        getAuthenticationContext: expect.any(Function),
        hasAuthenticationContext: expect.any(Function),
        isStepUpSupported: expect.any(Function),
      }),
    );
  });

  it("reads authentication context for the configured provider domain", async () => {
    const domain = "https://tenant.kinde.com";
    const context: AuthenticationContext = {
      acr: "mfa",
      amr: ["pwd", "otp"],
      authTime: 1_700_000_000,
    };
    mocked.getAuthenticationContext.mockResolvedValueOnce(context);
    const { auth } = await createProvider(undefined, { domain });

    await expect(auth.getAuthenticationContext()).resolves.toBe(context);

    expect(mocked.getAuthenticationContext).toHaveBeenCalledTimes(1);
    expect(mocked.getAuthenticationContext).toHaveBeenCalledWith(domain);
  });

  it("forwards the authentication-context requirement and configured domain", async () => {
    const domain = "https://tenant.kinde.com";
    const requirement: AuthenticationContextRequirement = {
      acr: "phr",
      maxAge: 0,
    };
    mocked.hasAuthenticationContext.mockResolvedValueOnce(true);
    const { auth } = await createProvider(undefined, { domain });

    await expect(auth.hasAuthenticationContext(requirement)).resolves.toBe(
      true,
    );
    expect(mocked.hasAuthenticationContext).toHaveBeenCalledWith(
      requirement,
      domain,
    );
  });

  it("checks step-up support for the configured provider domain", async () => {
    const domain = "https://tenant.kinde.com";
    mocked.isStepUpSupported.mockResolvedValueOnce(false);
    const { auth } = await createProvider(undefined, { domain });

    await expect(auth.isStepUpSupported()).resolves.toBe(false);
    expect(mocked.isStepUpSupported).toHaveBeenCalledWith(domain);
  });

  it("builds the step-up URL with provider settings and Expo state, nonce, and PKCE", async () => {
    const { auth } = await createProvider(undefined, {
      domain: "https://tenant.kinde.com",
      clientId: "step-up-client",
      scopes: "openid profile email",
    });
    const options: StepUpOptions = {
      acr: "phr",
      maxAge: 0,
      redirectURL: "kinde://step-up",
      orgCode: "org_abc",
      scope: ["email"] as LoginMethodParams["scope"],
      hasSuccessPage: false,
    };

    await auth.stepUp(options);

    expect(mocked.authRequest).toHaveBeenCalledTimes(1);
    expect(mocked.authRequest).toHaveBeenCalledWith({
      clientId: "step-up-client",
      redirectUri: "kinde://step-up",
      scopes: ["openid", "profile", "email"],
      extraParams: { has_success_page: "true" },
    });
    expect(mocked.getAuthRequestConfigAsync).toHaveBeenCalledTimes(1);
    expect(mocked.randomUUID).toHaveBeenCalledTimes(1);
    expect(mocked.stepUp).toHaveBeenCalledTimes(1);
    expect(mocked.stepUp).toHaveBeenCalledWith("https://tenant.kinde.com", {
      ...options,
      clientId: "step-up-client",
      scope: ["openid", "profile", "email"],
      hasSuccessPage: true,
      state: "expo-state",
      nonce: "2e53b83c-a7ad-4d7f-a83c-df251f9f721e",
      codeChallenge: "expo-challenge",
      codeChallengeMethod: "S256",
    });
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenCalledTimes(1);
    expect(mocked.mapLoginMethodParamsForUrl).toHaveBeenCalledWith({
      maxAge: 0,
      redirectURL: "kinde://step-up",
      orgCode: "org_abc",
      scope: ["email"],
      hasSuccessPage: false,
    });
  });

  it("preserves default scopes over per-call scopes when none are configured", async () => {
    const { auth } = await createProvider();
    const expectedScopes = ["openid", "profile", "email", "offline"];

    await auth.stepUp({
      acr: "mfa",
      scope: ["email"] as LoginMethodParams["scope"],
    });

    expect(mocked.authRequest).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: expectedScopes }),
    );
    expect(mocked.stepUp).toHaveBeenCalledWith(
      "https://example.kinde.com",
      expect.objectContaining({ scope: expectedScopes }),
    );
  });

  it("preserves step-up parameters but uses Expo's request fields in the browser URL", async () => {
    const { auth } = await createProvider();
    const authorizationEndpoint = "https://example.kinde.com/oauth2/auth";
    const redirectUri = "kinde://step-up/";
    const sharedParams = new URLSearchParams({
      client_id: "previous-client",
      redirect_uri: "kinde://previous",
      response_type: "token",
      state: "previous-state",
      code_challenge: "previous-challenge",
      code_challenge_method: "plain",
      scope: "email",
      has_success_page: "false",
      acr_values: "mfa",
      max_age: "0",
      lang: "fr",
    });
    mocked.stepUp.mockResolvedValueOnce({
      url: new URL(`${authorizationEndpoint}?${sharedParams}`),
      state: "previous-state",
      nonce: "shared-nonce",
      codeChallenge: "previous-challenge",
      codeVerifier: "shared-verifier",
    });

    await expect(
      auth.stepUp({ acr: "mfa", maxAge: 0, redirectURL: redirectUri }),
    ).resolves.toEqual({
      success: true,
      accessToken: "access-token",
      idToken: "id-token",
    });

    expect(mocked.promptAsync).toHaveBeenCalledTimes(1);
    const [discovery, options] = mocked.promptAsync.mock.calls[0];
    expect(discovery).toEqual({ authorizationEndpoint });
    expect(options).toMatchObject({
      showInRecents: true,
      url: expect.any(String),
    });
    const browserUrl = new URL(options.url!);
    expect(Object.fromEntries(browserUrl.searchParams)).toEqual({
      client_id: "client-id",
      redirect_uri: redirectUri,
      response_type: "code",
      state: "expo-state",
      code_challenge: "expo-challenge",
      code_challenge_method: "S256",
      scope: "openid profile email offline",
      has_success_page: "true",
      acr_values: "mfa",
      max_age: "0",
      lang: "fr",
    });
    expect(mocked.exchangeCodeAsync).toHaveBeenCalledTimes(1);
    expect(mocked.exchangeCodeAsync).toHaveBeenCalledWith(
      {
        clientId: "client-id",
        code: "authorization-code",
        redirectUri,
        extraParams: { code_verifier: "expo-verifier" },
      },
      { tokenEndpoint: "https://example.kinde.com/oauth2/token" },
    );
    expect(mocked.stepUp.mock.calls[0]?.[1]).not.toHaveProperty("prompt");
    expect(
      mocked.mapLoginMethodParamsForUrl.mock.calls[0]?.[0],
    ).not.toHaveProperty("prompt");
  });

  it("merges per-call browser options over step-up defaults without dropping other configured options", async () => {
    const { auth } = await createProvider(undefined, {
      browserOptions: { preferEphemeralSession: true, showInRecents: false },
    });

    await auth.stepUp({ maxAge: 0 }, { preferEphemeralSession: false });

    expect(mocked.promptAsync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        preferEphemeralSession: false,
        showInRecents: false,
        url: expect.any(String),
      }),
    );
  });

  it("fires success callbacks and the stepUp event exactly once", async () => {
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const { auth } = await createProvider({ onSuccess, onEvent, onError });

    const result = await auth.stepUp({ acr: "mfa" });

    expect(result).toEqual({
      success: true,
      accessToken: "access-token",
      idToken: "id-token",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(mockUser, {}, auth);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith("stepUp", result, auth);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([{}, { acrValues: ["mfa", "phr"] }, { acr: null, maxAge: null }])(
    "rejects missing acr and maxAge before creating a request: %j",
    async (options) => {
      const { auth } = await createProvider();

      await expect(
        auth.stepUp(options as unknown as StepUpOptions),
      ).rejects.toThrow("stepUp requires acr or maxAge.");

      expect(mocked.authRequest).not.toHaveBeenCalled();
      expect(mocked.getAuthRequestConfigAsync).not.toHaveBeenCalled();
      expect(mocked.stepUp).not.toHaveBeenCalled();
      expect(mocked.promptAsync).not.toHaveBeenCalled();
      expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
    },
  );

  it("propagates a shared builder rejection before opening a browser", async () => {
    const error = new Error("OpenID discovery failed");
    mocked.stepUp.mockRejectedValueOnce(error);
    const { auth } = await createProvider();

    await expect(auth.stepUp({ acr: "mfa" })).rejects.toBe(error);

    expect(mocked.promptAsync).not.toHaveBeenCalled();
    expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it("propagates Expo request-config rejection before building a URL or opening a browser", async () => {
    const error = new Error("Expo request configuration failed");
    mocked.getAuthRequestConfigAsync.mockRejectedValueOnce(error);
    const { auth } = await createProvider();

    await expect(auth.stepUp({ acr: "mfa" })).rejects.toBe(error);

    expect(mocked.stepUp).not.toHaveBeenCalled();
    expect(mocked.promptAsync).not.toHaveBeenCalled();
    expect(mocked.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it.each(["login", "register"] as const)(
    "leaves ordinary %s request initialization and code exchange unchanged",
    async (method) => {
      const { auth } = await createProvider();

      await expect(auth[method]()).resolves.toEqual({
        success: true,
        accessToken: "access-token",
        idToken: "id-token",
      });

      expect(mocked.getAuthRequestConfigAsync).not.toHaveBeenCalled();
      expect(mocked.randomUUID).not.toHaveBeenCalled();
      expect(mocked.stepUp).not.toHaveBeenCalled();
      expect(mocked.promptAsync).toHaveBeenCalledTimes(1);
      expect(mocked.promptAsync).toHaveBeenCalledWith(
        { authorizationEndpoint: "https://example.kinde.com/oauth2/auth" },
        { showInRecents: true },
      );
      expect(mocked.exchangeCodeAsync).toHaveBeenCalledWith(
        {
          clientId: "client-id",
          code: "authorization-code",
          redirectUri: "kinde://redirect",
          extraParams: undefined,
        },
        { tokenEndpoint: "https://example.kinde.com/oauth2/token" },
      );
    },
  );
});

describe("KindeAuthProvider token session lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal("navigator", undefined);
    mocked.getInsecureStorage.mockReturnValue(null);
    mocked.storageSettings.useInsecureForRefreshToken = false;
    mocked.getUserProfile.mockResolvedValue(mockUser);
    mocked.promptAsync.mockResolvedValue(authSuccessResult());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("waits for the browser before locking and holds the lock through the refresh token write", async () => {
    const { withTokenSessionLock } = await import("@kinde/js-utils");
    const { auth, storage } = await createProvider();
    let completePrompt!: (result: AuthSessionResult) => void;
    mocked.promptAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        completePrompt = resolve;
      }),
    );
    const tokens = {
      accessToken: "stepped-up-access-token",
      idToken: "stepped-up-id-token",
      refreshToken: "stepped-up-refresh-token",
    };
    mocked.exchangeCodeAsync.mockResolvedValueOnce(tokens);
    let finishWrite!: () => void;
    const pendingWrite = new Promise<undefined>((resolve) => {
      finishWrite = () => resolve(undefined);
    });
    storage.setSessionItem
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(pendingWrite);

    const stepUp = auth.stepUp({ acr: "mfa" });
    try {
      await vi.waitFor(() => expect(mocked.promptAsync).toHaveBeenCalled());
      expect(withTokenSessionLock).not.toHaveBeenCalled();
      expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();

      completePrompt(authSuccessResult());
      await vi.waitFor(() =>
        expect(storage.setSessionItem).toHaveBeenCalledWith(
          StorageKeys.refreshToken,
          tokens.refreshToken,
        ),
      );
      const refresh = vi.fn(async () => undefined);
      const queuedRefresh = withTokenSessionLock(refresh);
      await Promise.resolve();
      expect(refresh).not.toHaveBeenCalled();

      finishWrite();
      await expect(stepUp).resolves.toMatchObject({ success: true });
      await queuedRefresh;
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      completePrompt(authSuccessResult());
      finishWrite();
    }
  });

  it("releases the lock when exchange times out and ignores a late token response", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { withTokenSessionLock } = await import("@kinde/js-utils");
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { auth, storage } = await createProvider({ onSuccess, onError });
    const tokens = {
      accessToken: "late-access-token",
      idToken: "late-id-token",
      refreshToken: "late-refresh-token",
    };
    let completeExchange!: (result: typeof tokens) => void;
    mocked.exchangeCodeAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        completeExchange = resolve;
      }),
    );

    const stepUp = auth.stepUp({ acr: "mfa" });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocked.exchangeCodeAsync).toHaveBeenCalledTimes(1);
    const refresh = vi.fn(async () => undefined);
    const queuedRefresh = withTokenSessionLock(refresh);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(stepUp).resolves.toEqual({
      success: false,
      errorMessage: "Authorization code exchange timed out.",
    });
    await queuedRefresh;
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    completeExchange(tokens);
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.setSessionItem).not.toHaveBeenCalled();
    expect(storage.removeSessionItem).not.toHaveBeenCalled();
    expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it.each([
    ["access token", { idToken: "stepped-up-id-token", refreshToken: "RT2" }],
    [
      "ID token",
      { accessToken: "stepped-up-access-token", refreshToken: "RT2" },
    ],
  ] as const)(
    "leaves the existing session untouched when step-up omits the %s",
    async (_missingToken, exchangeCodeResponse) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const onSuccess = vi.fn();
      const { auth, storage } = await createProvider({ onSuccess });
      mocked.exchangeCodeAsync.mockResolvedValueOnce(exchangeCodeResponse);

      await expect(auth.stepUp({ acr: "mfa" })).resolves.toEqual({
        success: false,
        errorMessage:
          "Step-up did not return both an access token and an ID token.",
      });
      expect(storage.setSessionItem).not.toHaveBeenCalled();
      expect(storage.removeSessionItem).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ID", [false]],
    ["access", [true, false]],
  ] as const)(
    "leaves the existing session untouched when enhanced security rejects the %s token",
    async (tokenName, validationResults) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const onSuccess = vi.fn();
      const { auth, storage } = await createProvider(
        { onSuccess },
        { enhancedSecurity: true },
      );
      mocked.exchangeCodeAsync.mockResolvedValueOnce({
        accessToken: "stepped-up-access-token",
        idToken: "stepped-up-id-token",
        refreshToken: "RT2",
      });
      for (const valid of validationResults) {
        mocked.validateToken.mockResolvedValueOnce({ valid });
      }

      await expect(auth.stepUp({ acr: "mfa" })).resolves.toEqual({
        success: false,
        errorMessage: `Step-up returned an invalid ${tokenName} token.`,
      });
      expect(mocked.validateToken).toHaveBeenCalledTimes(
        validationResults.length,
      );
      expect(storage.setSessionItem).not.toHaveBeenCalled();
      expect(storage.removeSessionItem).not.toHaveBeenCalled();
      expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: "matching", claims: { nonce: "sent-nonce" }, success: true },
    { name: "different", claims: { nonce: "old-nonce" }, success: false },
    { name: "missing", claims: {}, success: false },
  ])(
    "checks a $name ID-token nonce before writing the session",
    async ({ claims, success }) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { auth, storage } = await createProvider();
      mocked.stepUp.mockResolvedValueOnce({
        url: new URL("https://example.kinde.com/oauth2/auth?nonce=sent-nonce"),
        state: "expo-state",
        nonce: "sent-nonce",
        codeChallenge: "expo-challenge",
        codeVerifier: "shared-verifier",
      });
      vi.mocked(jwtDecoder).mockReturnValueOnce(claims);

      const result = await auth.stepUp({ acr: "mfa" });

      expect(jwtDecoder).toHaveBeenCalledWith("id-token");
      if (success) {
        expect(result.success).toBe(true);
        expect(storage.setSessionItem).toHaveBeenCalledWith(
          StorageKeys.idToken,
          "id-token",
        );
      } else {
        expect(result).toEqual({
          success: false,
          errorMessage: "Step-up ID token nonce does not match the request.",
        });
        expect(storage.setSessionItem).not.toHaveBeenCalled();
        expect(storage.removeSessionItem).not.toHaveBeenCalled();
      }
    },
  );

  it("leaves the existing session untouched when step-up omits a replacement refresh token", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSuccess = vi.fn();
    const { auth, storage } = await createProvider({ onSuccess });
    storage.getSessionItem.mockResolvedValueOnce("RT1");
    mocked.exchangeCodeAsync.mockResolvedValueOnce({
      accessToken: "stepped-up-access-token",
      idToken: "stepped-up-id-token",
    });

    await expect(auth.stepUp({ acr: "mfa" })).resolves.toEqual({
      success: false,
      errorMessage: "Step-up did not return a replacement refresh token.",
    });
    expect(storage.getSessionItem).toHaveBeenCalledWith(
      StorageKeys.refreshToken,
    );
    expect(storage.setSessionItem).not.toHaveBeenCalled();
    expect(storage.removeSessionItem).not.toHaveBeenCalled();
    expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it.each(["split web", "native"] as const)(
    "sends the replacement refresh token after step-up (%s)",
    async (mode) => {
      const splitWeb = mode === "split web";
      const {
        clearActiveStorage,
        clearInsecureStorage,
        LocalStorage,
        MemoryStorage,
        refreshToken,
        setActiveStorage,
        setInsecureStorage,
        storageSettings,
      } =
        await vi.importActual<typeof import("@kinde/js-utils")>(
          "@kinde/js-utils",
        );
      const domain = splitWeb
        ? "https://auth.example.test"
        : "https://example.kinde.com";
      const clientId = "client-id";
      let storage: SessionManager;
      if (mode === "native") {
        const { ExpoSecureStore } = await vi.importActual<
          typeof import("./storage/ExpoSecureStore")
        >("./storage/ExpoSecureStore");
        storage = new ExpoSecureStore();
      } else {
        storage = new MemoryStorage();
      }
      if (splitWeb) {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => {
            values.set(key, value);
          },
          removeItem: (key: string) => {
            values.delete(key);
          },
        });
      }
      const refreshStorage = splitWeb ? new LocalStorage() : storage;
      await refreshStorage.setSessionItem(StorageKeys.refreshToken, "RT1");
      configureProviderState(storage);

      const { KindeAuthProvider } = await import("./KindeAuthProvider");
      const providerElement = KindeAuthProvider({
        children: null,
        config: { domain, clientId },
      });
      const auth = (providerElement as { props: { value: KindeAuthHook } })
        .props.value;
      const exchangeCodeResponse = {
        accessToken: "stepped-up-access-token",
        idToken: "stepped-up-id-token",
        refreshToken: "RT2",
      };
      mocked.exchangeCodeAsync.mockResolvedValueOnce(exchangeCodeResponse);
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ access_token: "refreshed-access-token" }),
        );
      vi.stubGlobal("fetch", fetchMock);

      setActiveStorage(storage);
      const previousSetting = storageSettings.useInsecureForRefreshToken;
      try {
        if (splitWeb) {
          setInsecureStorage(refreshStorage);
          mocked.getInsecureStorage.mockReturnValue(refreshStorage);
          storageSettings.useInsecureForRefreshToken = true;
          mocked.storageSettings.useInsecureForRefreshToken = true;
        }

        await expect(auth.stepUp({ acr: "mfa" })).resolves.toMatchObject({
          success: true,
        });
        expect(
          await refreshStorage.getSessionItem(StorageKeys.refreshToken),
        ).toBe("RT2");
        if (splitWeb) {
          expect(
            await storage.getSessionItem(StorageKeys.refreshToken),
          ).toBeNull();
        }
        expect(mocked.refreshToken).not.toHaveBeenCalled();

        await expect(refreshToken({ domain, clientId })).resolves.toMatchObject(
          {
            success: true,
          },
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe(`${domain}/oauth2/token`);
        expect(request?.method).toBe("POST");
        const body = new URLSearchParams(String(request?.body));
        expect(body.get("grant_type")).toBe("refresh_token");
        expect(body.get("refresh_token")).toBe("RT2");
      } finally {
        if (splitWeb) {
          clearInsecureStorage();
          mocked.getInsecureStorage.mockReturnValue(null);
          storageSettings.useInsecureForRefreshToken = previousSetting;
          mocked.storageSettings.useInsecureForRefreshToken = false;
        }
        clearActiveStorage();
      }
    },
  );
});

describe("KindeAuthProvider callback errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocked.getUserProfile.mockResolvedValue(mockUser);
    mocked.promptAsync.mockResolvedValue(authSuccessResult());
  });

  it.each([
    {
      code: "unmet_authentication_requirements",
      className: "UnmetAuthenticationRequirementsError",
    },
    { code: "login_required", className: "LoginRequiredError" },
  ] as const)(
    "should reject $code with the shared error class and preserve the session without retrying",
    async ({ code, className }) => {
      const errors = await import("./index");
      const onError = vi.fn();
      const onSuccess = vi.fn();
      const onEvent = vi.fn();
      const { auth, storage } = await createProvider({
        onError,
        onSuccess,
        onEvent,
      });
      mocked.promptAsync.mockResolvedValueOnce(authOAuthErrorResult(code));

      const result = auth.stepUp({ acr: "mfa", maxAge: 0 });

      await expect(result).rejects.toBeInstanceOf(errors[className]);
      await expect(result).rejects.toMatchObject({
        error: code,
        errorDescription: "Extra verification could not be completed",
        state: "expo-state",
        acr: "mfa",
        maxAge: 0,
      });
      expect(mocked.promptAsync).toHaveBeenCalledTimes(1);
      expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
      expect(storage.setSessionItem).not.toHaveBeenCalled();
      expect(storage.removeSessionItem).not.toHaveBeenCalled();
      expect(storage.removeItems).not.toHaveBeenCalled();
      expect(mocked.clearInsecureStorage).not.toHaveBeenCalled();
      expect(mocked.setRefreshTimer).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();
    },
  );

  it.each(["login", "register"] as const)(
    "should propagate unmet authentication requirements through %s",
    async (method) => {
      const { UnmetAuthenticationRequirementsError } = await import("./index");
      const { auth } = await createProvider();
      mocked.promptAsync.mockResolvedValueOnce(
        authOAuthErrorResult("unmet_authentication_requirements"),
      );

      await expect(auth[method]({ maxAge: 0 })).rejects.toBeInstanceOf(
        UnmetAuthenticationRequirementsError,
      );
      expect(mocked.promptAsync).toHaveBeenCalledTimes(1);
      expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
    },
  );

  it("uses Expo's state_mismatch instead of the raw callback error", async () => {
    const { auth, storage } = await createProvider();
    mocked.promptAsync.mockResolvedValueOnce(
      authOAuthErrorResult("state_mismatch", {
        error: "unmet_authentication_requirements",
      }),
    );

    await expect(auth.stepUp({ acr: "mfa" })).resolves.toEqual({
      success: false,
      errorMessage: "Unknown error",
    });
    expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
    expect(storage.setSessionItem).not.toHaveBeenCalled();
  });

  it.each(["wrong-state", ""])(
    "should not report a typed callback error for invalid state: %j",
    async (state) => {
      const { auth, storage } = await createProvider();
      mocked.promptAsync.mockResolvedValueOnce(
        authOAuthErrorResult("unmet_authentication_requirements", { state }),
      );

      await expect(auth.stepUp({ acr: "mfa" })).resolves.toEqual({
        success: false,
        errorMessage: "Unknown error",
      });
      expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
      expect(storage.setSessionItem).not.toHaveBeenCalled();
    },
  );

  it("should retain generic failure handling for unrelated OAuth errors", async () => {
    const onError = vi.fn();
    const { auth } = await createProvider({ onError });
    mocked.promptAsync.mockResolvedValueOnce(
      authOAuthErrorResult("access_denied"),
    );

    await expect(auth.stepUp({ acr: "mfa" })).resolves.toEqual({
      success: false,
      errorMessage: "Unknown error",
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
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

  it("rejects LoginRequiredError without interactive retry when silent auth requires login", async () => {
    const onSuccess = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();

    mocked.promptAsync.mockResolvedValueOnce(
      authOAuthErrorResult("login_required"),
    );

    const { switchOrg } = await createProvider({
      onError,
      onEvent,
      onSuccess,
    });

    const { LoginRequiredError } = await import("./index");
    await expect(switchOrg("org_abc")).rejects.toBeInstanceOf(
      LoginRequiredError,
    );
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
    expect(onError).not.toHaveBeenCalled();
    expect(mocked.exchangeCodeAsync).not.toHaveBeenCalled();
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

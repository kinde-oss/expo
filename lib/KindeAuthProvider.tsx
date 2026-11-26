import {
  LoginMethodParams,
  getClaim,
  getClaims,
  getCurrentOrganization,
  getRoles,
  getFlag,
  getUserProfile,
  getUserOrganizations,
  SessionManager,
  UserProfile,
  RefreshTokenResult,
  RefreshType,
  generatePortalUrl,
  PortalPage,
  OrgCode,
} from "@kinde/js-utils";
import {
  mapLoginMethodParamsForUrl,
  PromptTypes,
  setActiveStorage,
  StorageKeys,
  setRefreshTimer,
  refreshToken,
  withTokenSessionLock,
  stepUp as buildStepUpUrl,
  UnmetAuthenticationRequirementsError,
  LoginRequiredError,
} from "@kinde/js-utils";
import { validateToken } from "@kinde/jwt-validator";
import {
  AuthRequest,
  AuthRequestPromptOptions,
  DiscoveryDocument,
  exchangeCodeAsync,
  makeRedirectUri,
  revokeAsync,
  TokenTypeHint,
} from "expo-auth-session";
import { randomUUID } from "expo-crypto";
import { openAuthSessionAsync, openBrowserAsync } from "expo-web-browser";
import {
  createContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { DEFAULT_TOKEN_SCOPES } from "./constants";
import {
  LoginResponse,
  LogoutRequest,
  LogoutResult,
  PermissionAccess,
  Permissions,
  KindeBrowserOptions,
  StepUpOptions,
} from "./types";
import { KindeAuthHook } from "./useKindeAuth";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import { decode, encode } from "base-64";
import { Platform } from "react-native";
import {
  clearPersistedRefreshToken,
  completePendingWebAuthSession,
  createSessionStorage,
  performRemoteLogout,
  persistRefreshToken,
  getPersistedRefreshToken,
} from "./storage";
export const KindeAuthContext = createContext<KindeAuthHook | undefined>(
  undefined,
);

// globalThis is unavailable for web `expo export` script
if (typeof globalThis !== "undefined") {
  // Polyfill for atob
  globalThis.btoa = encode;
  globalThis.atob = decode;
}

completePendingWebAuthSession(
  Platform.OS,
  typeof window !== "undefined" ? window : undefined,
);

export type ErrorProps = {
  error: string;
  errorDescription: string;
};

enum AuthEvent {
  login = "login",
  logout = "logout",
  register = "register",
  switchOrg = "switchOrg",
  stepUp = "stepUp",
  tokenRefreshed = "tokenRefreshed",
}

const TOKEN_EXCHANGE_TIMEOUT_MS = 30_000;
const SWITCH_ORG_SILENT_AUTH_TIMEOUT_MS = 30_000;
const SWITCH_ORG_SILENT_AUTH_TIMEOUT_MESSAGE =
  "Organization switch timed out waiting for silent authentication. Your identity provider session may be stale.";

type SwitchOrgOptions = NonNullable<Parameters<KindeAuthHook["switchOrg"]>[1]>;

type AuthenticateOptions = Partial<LoginMethodParams> & {
  stepUpOptions?: StepUpOptions;
  authTimeoutMs?: number;
  suppressCallbacks?: boolean;
  browserOptions?: KindeBrowserOptions;
};

/**
 * Single boundary that maps Kinde's public browser options onto the underlying
 * Expo AuthSession/WebBrowser options. Undefined fields are
 * omitted so the result merges cleanly and stays empty when nothing is set.
 */
const toExpoBrowserOptions = (
  options: KindeBrowserOptions = {},
): AuthRequestPromptOptions => {
  const expoOptions: AuthRequestPromptOptions = {};
  if (options.preferEphemeralSession !== undefined) {
    expoOptions.preferEphemeralSession = options.preferEphemeralSession;
  }
  if (options.showInRecents !== undefined) {
    expoOptions.showInRecents = options.showInRecents;
  }
  return expoOptions;
};

type EventTypes = {
  (
    event: AuthEvent.tokenRefreshed,
    state: RefreshTokenResult,
    context: KindeAuthHook,
  ): void;
  (
    event: AuthEvent,
    state: Record<string, unknown>,
    context: KindeAuthHook,
  ): void;
};

type KindeCallbacks = {
  onSuccess?: (
    user: UserProfile,
    state: Record<string, unknown>,
    context: KindeAuthHook,
  ) => void;
  onError?: (
    props: ErrorProps,
    state: Record<string, string>,
    context: KindeAuthHook,
  ) => void;
  onEvent?: EventTypes;
};

type KindeAuthConfig = {
  domain: string | undefined;
  clientId: string | undefined;
  scopes?: string;
  enhancedSecurity?: boolean;
  browserOptions?: KindeBrowserOptions;
};

export const KindeAuthProvider = ({
  children,
  config,
  callbacks,
}: {
  children: React.ReactNode;
  config: KindeAuthConfig;
  callbacks?: KindeCallbacks;
}) => {
  if (config.domain === undefined) {
    throw new Error("KindeAuthProvider config.domain prop is undefined");
  }

  const domain = config.domain.toLowerCase().startsWith("http://")
    ? "https://" + config.domain.substring(7) // 7 is the length of "http://"
    : config.domain;

  const clientId = config.clientId;
  if (clientId === undefined)
    throw new Error("KindeAuthProvider config.clientId prop is undefined");

  const scopes = config.scopes?.split(" ") || DEFAULT_TOKEN_SCOPES.split(" ");

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const redirectUri = makeRedirectUri();

  const [storage, setStorage] = useState<SessionManager>();
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    const initializeStorage = async () => {
      try {
        const storageInstance = await createSessionStorage({
          platformOS: Platform.OS,
          windowObject: typeof window !== "undefined" ? window : undefined,
        });
        setActiveStorage(storageInstance);
        setStorage(storageInstance);
        setIsStorageReady(true);

        // refresh token on load
        const refreshResult = await refreshToken({
          domain,
          clientId,
          onRefresh,
        });
        if (refreshResult.success) {
          setIsAuthenticated(true);
        }
      } catch (error: unknown) {
        console.error("Failed to initialize storage:", error);

        callbacks?.onError?.(
          {
            error: "ERR_STORAGE",
            errorDescription: `Failed to initialize storage: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          {},
          contextValue,
        );
      } finally {
        setIsLoading(false);
      }
    };
    initializeStorage();
  }, []);

  const discovery: DiscoveryDocument | null = {
    authorizationEndpoint: `${domain}/oauth2/auth`,
    tokenEndpoint: `${domain}/oauth2/token`,
    endSessionEndpoint: `${domain}/logout`,
    userInfoEndpoint: `${domain}/oauth2/v2/user_profile`,
    revocationEndpoint: `${domain}/oauth2/revoke`,
  };

  const authenticate = async (
    options: AuthenticateOptions = {},
  ): Promise<LoginResponse> => {
    const {
      stepUpOptions,
      authTimeoutMs,
      suppressCallbacks,
      browserOptions,
      ...loginOptions
    } = options;
    const authRedirectUri = loginOptions.redirectURL || redirectUri;
    if (!authRedirectUri) {
      return {
        success: false,
        errorMessage:
          "A valid redirect URL is required for the current platform.",
      };
    }

    if (!storage) {
      return {
        success: false,
        errorMessage: "Storage is not ready",
      };
    }

    const request = new AuthRequest({
      clientId,
      redirectUri: authRedirectUri,
      scopes: scopes,
      extraParams: {
        ...mapLoginMethodParamsForUrl(loginOptions),
        has_success_page: "true",
      },
    });

    let stepUpUrl: string | undefined;
    let expectedStepUpNonce: string | null = null;
    if (stepUpOptions) {
      const expoRequest = await request.getAuthRequestConfigAsync();
      // Custom URLs bypass Expo's URL builder, including its scope precedence and defaults.
      const { url } = await buildStepUpUrl(domain, {
        ...loginOptions,
        acr: stepUpOptions.acr,
        clientId,
        redirectURL: authRedirectUri,
        scope: scopes as LoginMethodParams["scope"],
        hasSuccessPage: true,
        state: expoRequest.state,
        nonce: randomUUID(),
        codeChallenge: expoRequest.codeChallenge,
        codeChallengeMethod: expoRequest.codeChallengeMethod,
      });

      // The shared builder can override request fields when it applies reauthState.
      // Restore Expo's values so the browser URL matches the request used on return.
      const expoUrl = new URL(
        await request.makeAuthUrlAsync({
          authorizationEndpoint: `${domain}/oauth2/auth`,
        }),
      );
      for (const name of [
        "client_id",
        "redirect_uri",
        "response_type",
        "state",
        "code_challenge",
        "code_challenge_method",
        "scope",
        "has_success_page",
      ]) {
        const value = expoUrl.searchParams.get(name);
        if (value === null) {
          url.searchParams.delete(name);
        } else {
          url.searchParams.set(name, value);
        }
      }

      expectedStepUpNonce = url.searchParams.get("nonce");
      stepUpUrl = url.toString();
    }

    try {
      const promptAsync = request.promptAsync(
        {
          authorizationEndpoint: `${domain}/oauth2/auth`,
        } as DiscoveryDocument,
        {
          ...toExpoBrowserOptions({
            showInRecents: true,
            ...config.browserOptions,
            ...browserOptions,
          }),
          ...(stepUpUrl ? { url: stepUpUrl } : {}),
        },
      );
      const codeResponse = authTimeoutMs
        ? await Promise.race([
            promptAsync,
            new Promise<never>((_, reject) => {
              setTimeout(
                () => reject(new Error(SWITCH_ORG_SILENT_AUTH_TIMEOUT_MESSAGE)),
                authTimeoutMs,
              );
            }),
          ])
        : await promptAsync;

      if (codeResponse.type === "error") {
        const { state } = codeResponse.params;
        if (state && state === request.state) {
          const details = {
            errorDescription: codeResponse.params.error_description ?? "",
            state,
            acr: stepUpOptions?.acr,
            maxAge: loginOptions.maxAge,
          };
          if (
            codeResponse.error?.code === "unmet_authentication_requirements"
          ) {
            throw new UnmetAuthenticationRequirementsError(details);
          }
          if (codeResponse.error?.code === "login_required") {
            throw new LoginRequiredError(details);
          }
        }
      }

      if (request && codeResponse?.type === "success") {
        const { exchangeCodeResponse, savedAccessToken } =
          await withTokenSessionLock(async () => {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            // Expo does not expose an abort signal here. Time out only the
            // exchange so its response cannot reach storage if the timer wins.
            const exchangeCodeResponse = await Promise.race([
              exchangeCodeAsync(
                {
                  clientId,
                  code: codeResponse.params.code,
                  extraParams: request.codeVerifier
                    ? { code_verifier: request.codeVerifier }
                    : undefined,
                  redirectUri: authRedirectUri,
                },
                { tokenEndpoint: `${domain}/oauth2/token` },
              ),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                  () =>
                    reject(new Error("Authorization code exchange timed out.")),
                  TOKEN_EXCHANGE_TIMEOUT_MS,
                );
              }),
            ]).finally(() => clearTimeout(timeoutId));

            const enhancedSecurity = config.enhancedSecurity || false;
            if (stepUpOptions) {
              const { accessToken, idToken, refreshToken } =
                exchangeCodeResponse;
              if (!accessToken || !idToken) {
                throw new Error(
                  "Step-up did not return both an access token and an ID token.",
                );
              }
              if (!refreshToken && (await getPersistedRefreshToken(storage))) {
                throw new Error(
                  "Step-up did not return a replacement refresh token.",
                );
              }

              if (enhancedSecurity) {
                const idTokenValidationResult = await validateToken({
                  token: idToken,
                  domain,
                });
                if (!idTokenValidationResult.valid) {
                  throw new Error("Step-up returned an invalid ID token.");
                }

                const accessTokenValidationResult = await validateToken({
                  token: accessToken,
                  domain,
                });
                if (!accessTokenValidationResult.valid) {
                  throw new Error("Step-up returned an invalid access token.");
                }
              }

              if (
                expectedStepUpNonce !== null &&
                jwtDecoder<{ nonce?: string }>(idToken)?.nonce !==
                  expectedStepUpNonce
              ) {
                throw new Error(
                  "Step-up ID token nonce does not match the request.",
                );
              }
            }

            if (exchangeCodeResponse.idToken) {
              if (enhancedSecurity && !stepUpOptions) {
                const idTokenValidationResult = await validateToken({
                  token: exchangeCodeResponse.idToken,
                  domain: domain,
                });

                if (idTokenValidationResult.valid) {
                  await storage.setSessionItem(
                    StorageKeys.idToken,
                    exchangeCodeResponse.idToken,
                  );
                } else {
                  console.error(
                    `Invalid id token`,
                    idTokenValidationResult.message,
                  );
                }
              } else {
                await storage.setSessionItem(
                  StorageKeys.idToken,
                  exchangeCodeResponse.idToken,
                );
              }
            }

            let savedAccessToken = false;
            if (exchangeCodeResponse.accessToken) {
              if (enhancedSecurity && !stepUpOptions) {
                const accessTokenValidationResult = await validateToken({
                  token: exchangeCodeResponse.accessToken,
                  domain: domain,
                });
                if (accessTokenValidationResult.valid) {
                  await storage.setSessionItem(
                    StorageKeys.accessToken,
                    exchangeCodeResponse.accessToken,
                  );
                  savedAccessToken = true;
                } else {
                  console.error(
                    `Invalid access token`,
                    accessTokenValidationResult.message,
                  );
                }
              } else {
                await storage.setSessionItem(
                  StorageKeys.accessToken,
                  exchangeCodeResponse.accessToken,
                );
                savedAccessToken = true;
              }
            }
            await persistRefreshToken(storage, exchangeCodeResponse.refreshToken);

            if (exchangeCodeResponse.refreshToken) {
              setRefreshTimer(exchangeCodeResponse.expiresIn || 60, async () => {
                try {
                  await refreshToken({ domain, clientId, onRefresh });
                } catch (error) {
                  callbacks?.onError?.(
                    {
                      error: "ERR_REFRESH",
                      errorDescription:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                    },
                    {},
                    contextValue,
                  );
                }
              });
            }
            return { exchangeCodeResponse, savedAccessToken };
          });

        if (savedAccessToken) {
          setIsAuthenticated(true);
        }
        const user = await getUserProfile();
        if (user && !suppressCallbacks) {
          callbacks?.onSuccess?.(user, {}, contextValue);
        }

        return {
          success: true,
          accessToken: exchangeCodeResponse.accessToken,
          idToken: exchangeCodeResponse.idToken!,
        };
      }
      if (!suppressCallbacks) {
        callbacks?.onError?.(
          {
            error: "ERR_CODE_EXCHANGE",
            errorDescription: "Unknown Error",
          },
          {},
          contextValue,
        );
      }
      return {
        success: false,
        errorMessage: "Unknown error",
      };
    } catch (err: unknown) {
      if (
        err instanceof UnmetAuthenticationRequirementsError ||
        err instanceof LoginRequiredError
      ) {
        throw err;
      }

      console.error(err);
      const errorDescription =
        err instanceof Error ? err.message : "Unknown error";

      if (!suppressCallbacks) {
        callbacks?.onError?.(
          {
            error: "ERR_CODE_EXCHANGE",
            errorDescription,
          },
          {},
          contextValue,
        );
      }
      return { success: false, errorMessage: errorDescription };
    }
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const login = async (
    options: Partial<LoginMethodParams> = {},
    browserOptions?: KindeBrowserOptions,
  ): Promise<LoginResponse> => {
    const response = await authenticate({
      ...options,
      prompt: PromptTypes.login,
      suppressCallbacks: true,
      browserOptions,
    });
    await handleLoginResponse(response, AuthEvent.login);
    return response;
  };

  const stepUp = async (
    options: StepUpOptions,
    browserOptions?: KindeBrowserOptions,
  ): Promise<LoginResponse> => {
    if (options.acr == null && options.maxAge == null) {
      throw new Error("stepUp requires acr or maxAge.");
    }

    // reauthState can overwrite prompt=none before JS-utils validates it.
    if (
      typeof options.prompt === "string" &&
      options.prompt.toLowerCase() === PromptTypes.none
    ) {
      throw new Error("stepUp cannot send prompt=none.");
    }

    const { acr: _acr, ...loginOptions } = options;
    const response = await authenticate({
      ...loginOptions,
      stepUpOptions: options,
      suppressCallbacks: true,
      browserOptions,
    });
    await handleLoginResponse(response, AuthEvent.stepUp);
    return response;
  };

  const switchOrg = async (
    orgCode: OrgCode,
    options: SwitchOrgOptions = {},
  ): Promise<LoginResponse> => {
    let response = await authenticate({
      ...options,
      orgCode: orgCode,
      prompt: PromptTypes.none,
      authTimeoutMs: SWITCH_ORG_SILENT_AUTH_TIMEOUT_MS,
      suppressCallbacks: true,
    });

    if (
      !response.success &&
      response.errorMessage === SWITCH_ORG_SILENT_AUTH_TIMEOUT_MESSAGE
    ) {
      response = await authenticate({
        ...options,
        orgCode: orgCode,
        prompt: PromptTypes.login,
        suppressCallbacks: true,
      });
    }

    await handleLoginResponse(response, AuthEvent.switchOrg);
    return response;
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} subNav
   * @returns {void}
   */
  const portal = async (
    subNav: PortalPage = PortalPage.profile,
  ): Promise<void> => {
    try {
      const { url } = await generatePortalUrl({
        domain,
        subNav,
        returnUrl: redirectUri,
      });
      await openBrowserAsync(url.toString());
    } catch (error) {
      console.error("Failed to open Kinde portal", error);
      callbacks?.onError?.(
        {
          error: "ERR_PORTAL",
          errorDescription:
            error instanceof Error ? error.message : "Unknown error",
        },
        {},
        contextValue,
      );
    }
  };

  const handleLoginResponse = async (
    response: LoginResponse,
    eventType: AuthEvent = AuthEvent.login,
  ) => {
    if (response.success) {
      const user = await getUserProfile();
      if (user) {
        callbacks?.onEvent?.(eventType, response, contextValue);
        callbacks?.onSuccess?.(user, {}, contextValue);
      }
    } else {
      callbacks?.onError?.(
        {
          error: "ERR_LOGIN",
          errorDescription: response.errorMessage,
        },
        {},
        contextValue,
      );
    }
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const register = async (
    options: Partial<LoginMethodParams> = {},
    browserOptions?: KindeBrowserOptions,
  ): Promise<LoginResponse> => {
    const response = await authenticate({
      ...options,
      prompt: PromptTypes.create,
      suppressCallbacks: true,
      browserOptions,
    });
    await handleLoginResponse(response, AuthEvent.register);
    return response;
  };

  /**
   * logout method
   * @param {LogoutRequest} options
   * @returns {Promise<LogoutResult>}
   */
  async function logout(
    { revokeToken }: Partial<LogoutRequest> = {},
    browserOptions?: KindeBrowserOptions,
  ): Promise<LogoutResult> {
    if (!storage) {
      return Promise.resolve({
        success: false,
      });
    }
    const cleanup = async () => {
      await storage.removeItems(StorageKeys.accessToken, StorageKeys.idToken);
      await clearPersistedRefreshToken(storage);
      callbacks?.onEvent?.(AuthEvent.logout, {}, contextValue);
      setIsAuthenticated(false);
    };

    let success = true;

    if (revokeToken && discovery?.revocationEndpoint) {
      try {
        const [accessResult, refreshResult] = await Promise.allSettled([
          getAccessToken(),
          getPersistedRefreshToken(storage),
        ]);

        if (accessResult.status === "rejected") {
          console.error("Access token retrieval failed:", accessResult.reason);
          success = false;
        }
        if (refreshResult.status === "rejected") {
          console.error(
            "Refresh token retrieval failed:",
            refreshResult.reason,
          );
          success = false;
        }

        const currentAccess =
          accessResult.status === "fulfilled" ? accessResult.value : null;
        const currentRefresh =
          refreshResult.status === "fulfilled" ? refreshResult.value : null;

        const revokePromises = [];

        if (currentAccess) {
          revokePromises.push(
            revokeAsync(
              {
                clientId: config.clientId,
                token: currentAccess,
                tokenTypeHint: TokenTypeHint.AccessToken,
              },
              discovery,
            ),
          );
        }

        if (currentRefresh) {
          revokePromises.push(
            revokeAsync(
              {
                clientId: config.clientId,
                token: currentRefresh,
                tokenTypeHint: TokenTypeHint.RefreshToken,
              },
              discovery,
            ),
          );
        }

        if (revokePromises.length > 0) {
          const results = await Promise.allSettled(revokePromises);
          for (const result of results) {
            if (result.status === "rejected") {
              console.error("Token revocation failed:", result.reason);
              success = false;
            }
          }
        }
      } catch (err: unknown) {
        console.error(err);
        success = false;
      }
    }

    try {
      await cleanup();
    } catch (err: unknown) {
      console.error(err);
      success = false;
    }

    try {
      await performRemoteLogout({
        discovery,
        redirectUri,
        browserOptions: toExpoBrowserOptions({
          ...config.browserOptions,
          ...browserOptions,
        }),
        openAuthSession: async (url, authRedirectUri, options) =>
          openAuthSessionAsync(url, authRedirectUri, options),
      });
    } catch (err: unknown) {
      console.error(err);
      success = false;
    }

    return { success };
  }

  /**
   * Get current active access token, returns null if no token found
   * @returns {Promise<string | null>}
   */
  async function getAccessToken(): Promise<string | null> {
    if (!storage) {
      return Promise.resolve(null);
    }
    return (await storage.getSessionItem(StorageKeys.accessToken)) as string;
  }

  /**
   * Get current active id token, returns null if no token found
   * @returns {Promise<string | null>}
   */
  async function getIdToken(): Promise<string | null> {
    if (!storage) {
      return Promise.resolve(null);
    }
    return (await storage.getSessionItem(StorageKeys.idToken)) as string;
  }

  /**
   *
   * @param tokenType Type of token to decode
   * @returns { Promise<JWTDecoded | null> }
   */
  async function getDecodedToken<
    T = JWTDecoded & {
      permissions: string[];
      org_code: string;
    },
  >(tokenType: "accessToken" | "idToken" = "accessToken"): Promise<T | null> {
    const token =
      tokenType === "accessToken" ? await getAccessToken() : await getIdToken();
    if (!token) {
      return null;
    }
    return jwtDecoder<T>(token);
  }

  /**
   *
   * @param permissionKey gets the value of a permission
   * @returns { PermissionAccess }
   */
  async function getPermission(
    permissionKey: string,
  ): Promise<PermissionAccess> {
    const token = await getDecodedToken();

    if (!token) {
      return {
        permissionKey,
        orgCode: null,
        isGranted: false,
      };
    }

    const permissions = token.permissions || [];
    return {
      permissionKey,
      orgCode: token.org_code,
      isGranted: !!permissions.includes(permissionKey),
    };
  }

  async function getPermissions(): Promise<Permissions> {
    const token = await getDecodedToken();

    if (!token) {
      return {
        orgCode: null,
        permissions: [],
      };
    }

    const permissions = token.permissions || [];
    return {
      orgCode: token.org_code,
      permissions,
    };
  }

  const contextValue = useMemo((): KindeAuthHook => {
    return {
      login,
      logout,
      register,
      stepUp,
      getAuthenticationContext: async () => {
        const { getAuthenticationContext } = await import("@kinde/js-utils");
        return getAuthenticationContext(domain);
      },
      hasAuthenticationContext: async (requirement) => {
        const { hasAuthenticationContext } = await import("@kinde/js-utils");
        return hasAuthenticationContext(requirement, domain);
      },
      isStepUpSupported: async () => {
        const { isStepUpSupported } = await import("@kinde/js-utils");
        return isStepUpSupported(domain);
      },
      portal,
      switchOrg,
      getAccessToken,
      getIdToken,
      getDecodedToken,

      /**
       *
       * @param keyName key to get from the token
       * @returns { Promise<string | number | string[] | null> }
       */
      getClaim: async <T = JWTDecoded,>(
        ...args: Parameters<typeof getClaim<T>>
      ) => {
        const { getClaim } = await import("@kinde/js-utils");
        return getClaim(...args);
      },
      // /**
      //  * get all claims from the token
      //  * @returns { Promise<T | null> }
      //  */
      getClaims: async <T = JWTDecoded,>(
        ...args: Parameters<typeof getClaims<T>>
      ) => {
        const { getClaims } = await import("@kinde/js-utils");
        return getClaims(...args);
      },

      getCurrentOrganization: async (
        ...args: Parameters<typeof getCurrentOrganization>
      ) => {
        const { getCurrentOrganization } = await import("@kinde/js-utils");
        return getCurrentOrganization(...args);
      },
      getFlag: async (...args: Parameters<typeof getFlag>) => {
        const { getFlag } = await import("@kinde/js-utils");
        return getFlag(...args);
      },
      getUserProfile: async (...args: Parameters<typeof getUserProfile>) => {
        const { getUserProfile } = await import("@kinde/js-utils");
        return getUserProfile(...args);
      },

      /**
       *
       * @param permissionKey gets the value of a permission
       * @returns { PermissionAccess }
       */
      getPermission: async (...args: Parameters<typeof getPermission>) => {
        const { getPermission } = await import("@kinde/js-utils");
        return getPermission(...args);
      },

      /**
       * Get all permissions
       * @returns { Promise<Permissions> }
       */
      getPermissions: async (...args: Parameters<typeof getPermissions>) => {
        const { getPermissions } = await import("@kinde/js-utils");
        return getPermissions(...args);
      },
      getUserOrganizations: async (
        ...args: Parameters<typeof getUserOrganizations>
      ) => {
        const { getUserOrganizations } = await import("@kinde/js-utils");
        return getUserOrganizations(...args);
      },
      getRoles: async (...args: Parameters<typeof getRoles>) => {
        const { getRoles } = await import("@kinde/js-utils");
        return getRoles(...args);
      },
      refreshToken: async (args: {
        domain: string;
        clientId: string;
        refreshType?: RefreshType;
        onRefresh?: (data: RefreshTokenResult) => void;
      }) => {
        const { refreshToken } = await import("@kinde/js-utils");
        return refreshToken(args);
      },

      isAuthenticated,
      isLoading,
    };
  }, [
    login,
    logout,
    register,
    stepUp,
    portal,
    switchOrg,
    isStorageReady,
    storage,
    isAuthenticated,
    isLoading,
  ]);

  const onRefresh = useCallback(
    (data: RefreshTokenResult) => {
      callbacks?.onEvent?.(AuthEvent.tokenRefreshed, data, contextValue);
    },
    [callbacks, contextValue],
  );

  if (!isStorageReady || !storage) {
    return null;
  }

  return (
    <KindeAuthContext.Provider value={contextValue}>
      {children}
    </KindeAuthContext.Provider>
  );
};

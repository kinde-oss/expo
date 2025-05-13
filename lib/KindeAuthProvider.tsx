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
} from "@kinde/js-utils";
import {
  ExpoSecureStore,
  mapLoginMethodParamsForUrl,
  PromptTypes,
  setActiveStorage,
  StorageKeys,
  setRefreshTimer,
  refreshToken,
} from "@kinde/js-utils";
import { validateToken } from "@kinde/jwt-validator";
import {
  AuthRequest,
  DiscoveryDocument,
  exchangeCodeAsync,
  makeRedirectUri,
  revokeAsync,
  TokenTypeHint,
} from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
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
} from "./types";
import { KindeAuthHook } from "./useKindeAuth";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import Constants from "expo-constants";
import { decode, encode } from "base-64";
export const KindeAuthContext = createContext<KindeAuthHook | undefined>(
  undefined,
);

// global is unavailable for web `expo export` script
if (typeof global !== "undefined") {
  // Polyfill for atob
  global.btoa = encode;
  global.atob = decode;
}

export type ErrorProps = {
  error: string;
  errorDescription: string;
};

enum AuthEvent {
  login = "login",
  logout = "logout",
  register = "register",
  tokenRefreshed = "tokenRefreshed",
}

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

export const KindeAuthProvider = ({
  children,
  config,
  callbacks,
}: {
  children: React.ReactNode;
  config: {
    domain: string | undefined;
    clientId: string | undefined;
    scopes?: string;
  };
  callbacks?: KindeCallbacks;
}) => {
  const domain = config.domain;
  if (domain === undefined)
    throw new Error("KindeAuthProvider config.domain prop is undefined");

  const clientId = config.clientId;
  if (clientId === undefined)
    throw new Error("KindeAuthProvider config.clientId prop is undefined");

  const scopes = config.scopes?.split(" ") || DEFAULT_TOKEN_SCOPES.split(" ");

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const redirectUri = makeRedirectUri({ native: Constants.isDevice });

  const [storage, setStorage] = useState<SessionManager>();
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    const initializeStorage = async () => {
      try {
        const ExpoStore = await ExpoSecureStore.default();
        const storageInstance = new ExpoStore();
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
    options: Partial<LoginMethodParams> = {},
  ): Promise<LoginResponse> => {
    if (!redirectUri) {
      return {
        success: false,
        errorMessage: "This library only works on a mobile device",
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
      redirectUri,
      scopes: scopes,
      extraParams: {
        ...mapLoginMethodParamsForUrl(options),
        has_success_page: "true",
      },
    });

    try {
      const codeResponse = await request.promptAsync(
        {
          authorizationEndpoint: `${domain}/oauth2/auth`,
        } as DiscoveryDocument,
        {
          showInRecents: true,
        },
      );
      if (request && codeResponse?.type === "success") {
        const exchangeCodeResponse = await exchangeCodeAsync(
          {
            clientId,
            code: codeResponse.params.code,
            extraParams: request.codeVerifier
              ? { code_verifier: request.codeVerifier }
              : undefined,
            redirectUri,
          },
          { tokenEndpoint: `${domain}/oauth2/token` },
        );

        if (exchangeCodeResponse.idToken) {
          const idTokenValidationResult = await validateToken({
            token: exchangeCodeResponse.idToken,
            domain: domain,
          });

          if (idTokenValidationResult.valid) {
            storage.setSessionItem(
              StorageKeys.idToken,
              exchangeCodeResponse.idToken,
            );
          } else {
            console.error(`Invalid id token`, idTokenValidationResult.message);
          }
        }

        const accessTokenValidationResult = await validateToken({
          token: exchangeCodeResponse.accessToken,
          domain: domain,
        });
        if (accessTokenValidationResult.valid) {
          storage.setSessionItem(
            StorageKeys.accessToken,
            exchangeCodeResponse.accessToken,
          );
          setIsAuthenticated(true);
        } else {
          console.error(
            `Invalid access token`,
            accessTokenValidationResult.message,
          );
        }

        storage.setSessionItem(
          StorageKeys.refreshToken,
          exchangeCodeResponse.refreshToken,
        );

        setRefreshTimer(exchangeCodeResponse.expiresIn || 60, async () => {
          try {
            await refreshToken({ domain, clientId, onRefresh });
          } catch (error) {
            callbacks?.onError?.(
              {
                error: "ERR_REFRESH",
                errorDescription:
                  error instanceof Error ? error.message : "Unknown error",
              },
              {},
              contextValue,
            );
          }
        });
        const user = await getUserProfile();
        if (user) {
          callbacks?.onSuccess?.(user, {}, contextValue);
        }

        return {
          success: true,
          accessToken: exchangeCodeResponse.accessToken,
          idToken: exchangeCodeResponse.idToken!,
        };
      }
      callbacks?.onError?.(
        {
          error: "ERR_CODE_EXCHANGE",
          errorDescription: "Unknown Error",
        },
        {},
        contextValue,
      );
      return {
        success: false,
        errorMessage: "Unknown error",
      };
    } catch (err: unknown) {
      console.error(err);
      const errorDescription =
        err instanceof Error ? err.message : "Unknown error";

      callbacks?.onError?.(
        {
          error: "ERR_CODE_EXCHANGE",
          errorDescription,
        },
        {},
        contextValue,
      );
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
  ): Promise<LoginResponse> => {
    const response = await authenticate({
      ...options,
      prompt: PromptTypes.login,
    });
    handleLoginResponse(response, AuthEvent.login);
    return response;
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
  ): Promise<LoginResponse> => {
    const response = await authenticate({
      ...options,
      prompt: PromptTypes.create,
    });
    await handleLoginResponse(response, AuthEvent.register);
    return response;
  };

  /**
   * logout method
   * @param {LogoutRequest} options
   * @returns {Promise<LogoutResult>}
   */
  async function logout({
    revokeToken,
  }: Partial<LogoutRequest> = {}): Promise<LogoutResult> {
    if (!storage) {
      return Promise.resolve({
        success: false,
      });
    }
    const cleanup = async () => {
      await storage.removeItems(
        StorageKeys.accessToken,
        StorageKeys.idToken,
        StorageKeys.refreshToken,
      );
      callbacks?.onEvent?.(AuthEvent.logout, {}, contextValue);
      setIsAuthenticated(false);
    };

    return new Promise(async (resolve) => {
      const accesstoken = (await storage.getSessionItem(
        StorageKeys.accessToken,
      )) as string;
      if (accesstoken && discovery) {
        if (revokeToken) {
          revokeAsync(
            { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
            discovery,
          )
            .then(async () => {
              await cleanup();
              resolve({ success: true });
            })
            .catch((err: unknown) => {
              console.error(err);
              resolve({ success: false });
            });
        } else {
          await openAuthSessionAsync(
            `${discovery?.endSessionEndpoint}?redirect=${redirectUri}`,
          );
          await cleanup();
          resolve({ success: true });
        }
      }
      resolve({ success: true });
    });
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

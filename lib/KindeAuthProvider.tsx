import type {
  LoginMethodParams,
  getClaim,
  getClaims,
  getCurrentOrganization,
  getRoles,
  getFlag,
  getUserProfile,
  getUserOrganizations,
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
import { createContext, useEffect, useState } from "react";
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

const storage = new ExpoSecureStore();
setActiveStorage(storage);

export const KindeAuthProvider = ({
  children,
  config,
}: {
  children: React.ReactNode;
  config: {
    domain: string | undefined;
    clientId: string | undefined;
    scopes?: string;
  };
}) => {
  const domain = config.domain;
  if (domain === undefined)
    throw new Error("KindeAuthProvider config.domain prop is undefined");

  const clientId = config.clientId;
  if (clientId === undefined)
    throw new Error("KindeAuthProvider config.clientId prop is undefined");

  const scopes = config.scopes?.split(" ") || DEFAULT_TOKEN_SCOPES.split(" ");

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const redirectUri = makeRedirectUri({ native: Constants.isDevice });

  const discovery: DiscoveryDocument | null = {
    authorizationEndpoint: `${domain}/oauth2/auth`,
    tokenEndpoint: `${domain}/oauth2/token`,
    endSessionEndpoint: `${domain}/logout`,
    userInfoEndpoint: `${domain}/oauth2/v2/user_profile`,
    revocationEndpoint: `${domain}/oauth2/revoke`,
  };

  useEffect(() => {
    const checkAuthentication = async () => {
      const token = await getAccessToken();
      if (token) {
        setIsAuthenticated(true);
      }
    };
    checkAuthentication();
  }, []);

  const authenticate = async (
    options: Partial<LoginMethodParams> = {},
  ): Promise<LoginResponse> => {
    if (!redirectUri) {
      return {
        success: false,
        errorMessage: "This library only works on a mobile device",
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
          refreshToken({ domain, clientId });
        });

        return {
          success: true,
          accessToken: exchangeCodeResponse.accessToken,
          idToken: exchangeCodeResponse.idToken!,
        };
      }
      return {
        success: false,
        errorMessage: "Unknown error",
      };
    } catch (err: any) {
      console.error(err);
      return { success: false, errorMessage: err.message };
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
    return authenticate({ ...options, prompt: PromptTypes.login });
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const register = async (
    options: Partial<LoginMethodParams> = {},
  ): Promise<LoginResponse> => {
    return authenticate({ ...options, prompt: PromptTypes.create });
  };

  /**
   * logout method
   * @param {LogoutRequest} options
   * @returns {Promise<LogoutResult>}
   */
  async function logout({
    revokeToken,
  }: Partial<LogoutRequest> = {}): Promise<LogoutResult> {
    const endSession = async () => {
      await openAuthSessionAsync(
        `${discovery?.endSessionEndpoint}?redirect=${redirectUri}`,
      );
      await storage.removeItems(StorageKeys.accessToken, StorageKeys.idToken)
      
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
              await endSession();
              resolve({ success: true });
            })
            .catch((err: unknown) => {
              console.error(err);
              resolve({ success: false });
            });
        } else {
          await endSession();
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
    return (await storage.getSessionItem(StorageKeys.accessToken)) as string;
  }

  /**
   * Get current active id token, returns null if no token found
   * @returns {Promise<string | null>}
   */
  async function getIdToken(): Promise<string | null> {
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

  const value: KindeAuthHook = {
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
    // refreshToken: async (...args: Parameters<typeof refreshToken>) => {
    //   const { refreshToken } = await import("@kinde/js-utils");
    //   return refreshToken(...args);
    // },

    isAuthenticated,
  };

  return (
    <KindeAuthContext.Provider value={value}>
      {children}
    </KindeAuthContext.Provider>
  );
};

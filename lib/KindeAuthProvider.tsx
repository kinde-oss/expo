import { LoginMethodParams, mapLoginMethodParamsForUrl } from "@kinde/js-utils";
import { validateToken } from "@kinde/jwt-validator";
import {
  AuthRequest,
  exchangeCodeAsync,
  makeRedirectUri,
  refreshAsync,
  revokeAsync,
  TokenResponse,
  TokenTypeHint,
} from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import { createContext, useEffect, useState } from "react";
import { DEFAULT_TOKEN_SCOPES } from "./constants";
import { getStorage, setStorage, StorageKeys } from "./storage";
import {
  LoginResponse,
  LogoutRequest,
  LogoutResult,
  PermissionAccess,
  Permissions,
  RefreshResponse,
  UserProfile,
} from "./types";
import { KindeAuthHook } from "./useKindeAuth";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import Constants from "expo-constants";
import { decode, encode } from "base-64";

export const KindeAuthContext = createContext<KindeAuthHook | undefined>(
  undefined,
);

// Polyfill for atob
global.btoa = encode;
global.atob = decode;

export const KindeAuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const domain = process.env.EXPO_PUBLIC_KINDE_DOMAIN!;

  const clientId = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID!;
  const scopes =
    process.env.EXPO_PUBLIC_KINDE_SCOPES?.split(" ") ||
    DEFAULT_TOKEN_SCOPES.split(" ");

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const redirectUri =
    process.env.EXPO_PUBLIC_KINDE_REDIRECT_URL ||
    makeRedirectUri({
      native: Constants.isDevice,
      path: "kinde_callback",
    });

  useEffect(() => {
    const checkAuthentication = async () => {
      const token = await getStorage(StorageKeys.accessToken);
      if (token) {
        setIsAuthenticated(true);
      }
    };
    checkAuthentication();
  }, []);

  const clearStorage = async () => {
    await setStorage(StorageKeys.accessToken, null);
    await setStorage(StorageKeys.idToken, null);
    await setStorage(StorageKeys.refreshToken, null);
    setIsAuthenticated(false);
  };

  const storeTokens = async (exchangeCodeResponse: TokenResponse) => {
    if (exchangeCodeResponse.idToken) {
      const idTokenValidationResult = await validateToken({
        token: exchangeCodeResponse.idToken,
        domain: domain,
      });
      if (idTokenValidationResult.valid) {
        await setStorage(StorageKeys.idToken, exchangeCodeResponse.idToken);
      } else {
        console.error(`Invalid id token`, idTokenValidationResult.message);
      }
    }

    if (exchangeCodeResponse.refreshToken) {
      await setStorage(
        StorageKeys.refreshToken,
        exchangeCodeResponse.refreshToken,
      );
    }

    const accessTokenValidationResult = await validateToken({
      token: exchangeCodeResponse.accessToken,
      domain: domain,
    });
    if (accessTokenValidationResult.valid) {
      await setStorage(
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
        },
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
          {
            tokenEndpoint: `${domain}/oauth2/token`,
          },
        );

        await storeTokens(exchangeCodeResponse);

        return {
          success: true,
          accessToken: exchangeCodeResponse.accessToken,
          idToken: exchangeCodeResponse.idToken!,
        };
      } else {
        return { success: false, errorMessage: "No code response" };
      }
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
    return authenticate({ ...options, prompt: "login" });
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const register = async (
    options: Partial<LoginMethodParams> = {},
  ): Promise<LoginResponse> => {
    return authenticate({ ...options, prompt: "create" });
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
      await openAuthSessionAsync(`${domain}/logout?redirect=${redirectUri}`);
      await setStorage(StorageKeys.accessToken, null);
      await setStorage(StorageKeys.idToken, null);
      setIsAuthenticated(false);
    };

    return new Promise(async (resolve) => {
      const accesstoken = await getStorage(StorageKeys.accessToken);
      if (accesstoken) {
        if (revokeToken) {
          revokeAsync(
            { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
            {
              revocationEndpoint: `${domain}/oauth2/revoke`,
            },
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
   * Refresh token
   * @returns {Promise<void>}
   */
  async function refreshToken(): Promise<RefreshResponse> {
    const refreshToken = await getStorage(StorageKeys.refreshToken);
    if (refreshToken) {
      const refreshedTokens = await refreshAsync(
        {
          refreshToken,
          clientId,
        },
        {
          tokenEndpoint: `${domain}/oauth2/token`,
        },
      );

      await storeTokens(refreshedTokens);

      return {
        success: true,
        accessToken: refreshedTokens.accessToken,
        idToken: refreshedTokens.idToken,
      };
    } else {
      return {
        success: false,
        errorMessage: "No refresh token found",
      };
    }
  }

  /**
   * Get current active access token, returns null if no token found
   * @returns {Promise<string | null>}
   */
  async function getAccessToken(): Promise<string | null> {
    return getStorage(StorageKeys.accessToken);
  }

  /**
   * Get current active id token, returns null if no token found
   * @returns {Promise<string | null>}
   */
  async function getIdToken(): Promise<string | null> {
    return getStorage(StorageKeys.idToken);
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

  /**
   * Get all permissions
   * @returns { Promise<Permissions> }
   */
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

  /**
   * get all claims from the token
   * @returns { Promise<T | null> }
   */
  async function getClaims<T = JWTDecoded>(): Promise<T | null> {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    return jwtDecoder<T>(token);
  }

  /**
   *
   * @param keyName key to get from the token
   * @returns { Promise<string | number | string[] | null> }
   */
  async function getClaim<T = JWTDecoded, V = string | number | string[]>(
    keyName: keyof T,
  ): Promise<{
    name: keyof T;
    value: V;
  } | null> {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    const claims = jwtDecoder<T>(token);
    if (!claims) {
      return null;
    }
    return {
      name: keyName,
      value: claims[keyName] as V,
    };
  }

  async function getCurrentOrganization(): Promise<string | null> {
    return (
      (await getClaim<{ org_code: string }, string>("org_code"))?.value || null
    );
  }

  async function getUserOrganizations(): Promise<string[] | null> {
    return (
      (
        await getDecodedToken<{
          org_codes: string[];
        }>("idToken")
      )?.org_codes || null
    );
  }

  async function getFlag<T = string | boolean | number>(
    name: string,
  ): Promise<T | null> {
    const flags = (
      await getClaim<
        { feature_flags: string },
        Record<string, { t: "b" | "i" | "s"; v: T }>
      >("feature_flags")
    )?.value;

    if (name && flags) {
      const value = flags[name];
      return value.v;
    }
    return null;
  }

  async function getUserProfile(): Promise<UserProfile | null> {
    const idToken = await getDecodedToken<{
      sub: string;
      given_name: string;
      family_name: string;
      email: string;
      picture: string;
    }>("idToken");
    if (!idToken) {
      return null;
    }
    return {
      id: idToken.sub,
      givenName: idToken.given_name,
      familyName: idToken.family_name,
      email: idToken.email,
      picture: idToken.picture,
    };
  }

  const value: KindeAuthHook = {
    login,
    logout,
    register,

    getAccessToken,
    getIdToken,
    getDecodedToken,
    refreshToken,

    getPermission,
    getPermissions,

    getClaims,
    getClaim,

    getUserProfile,

    getCurrentOrganization,
    getUserOrganizations,

    getFlag,

    clearStorage,

    isAuthenticated,
  };

  return (
    <KindeAuthContext.Provider value={value}>
      {children}
    </KindeAuthContext.Provider>
  );
};

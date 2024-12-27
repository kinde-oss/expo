import { LoginMethodParams, mapLoginMethodParamsForUrl } from "@kinde/js-utils";
import { validateToken } from "@kinde/jwt-validator";
import {
  AuthRequest,
  DiscoveryDocument,
  exchangeCodeAsync,
  makeRedirectUri,
  useAutoDiscovery,
  revokeAsync,
  TokenTypeHint,
  refreshAsync,
  TokenResponse,
} from "expo-auth-session";

import {
  openAuthSessionAsync,
  maybeCompleteAuthSession,
} from "expo-web-browser";
import { createContext, useEffect, useState } from "react";
import { DEFAULT_PLATFORM, DEFAULT_TOKEN_SCOPES } from "./constants";
import StorageProvider from "./storage";
import {
  LoginResponse,
  LogoutRequest,
  LogoutResult,
  PermissionAccess,
  Permissions,
  UserProfile,
} from "./types";
import { KindeAuthHook } from "./useKindeAuth";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import Constants from "expo-constants";
import { decode, encode } from "base-64";
import { StorageKeys } from "./enums";

// Required for expo web redirect callback
maybeCompleteAuthSession();

export const KindeAuthContext = createContext<KindeAuthHook | undefined>(
  undefined
);

// Polyfill for atob
global.btoa = encode;
global.atob = decode;

export const KindeAuthProvider = ({
  children,
  config,
}: {
  children: React.ReactNode;
  config: {
    domain: string | undefined;
    clientId: string | undefined;
    scopes?: string;
    platform?: "web" | "native";
  };
}) => {
  const domain = config.domain;
  if (domain === undefined)
    throw new Error("KindeAuthProvider config.domain prop is undefined");

  const clientId = config.clientId;
  if (clientId === undefined)
    throw new Error("KindeAuthProvider config.clientId prop is undefined");

  // Handle the storage provider based on platform.
  const platform = config.platform ?? DEFAULT_PLATFORM;
  const { getStorage, setStorage } = StorageProvider(platform);

  const scopes = config.scopes?.split(" ") || DEFAULT_TOKEN_SCOPES.split(" ");

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  const redirectUri = makeRedirectUri({ native: Constants.isDevice });

  const discovery: DiscoveryDocument | null = {
    ...useAutoDiscovery(domain),
    revocationEndpoint: `${domain}/oauth2/revoke`,
  };

  useEffect(() => {
    const checkAuthentication = async () => {
      const token = await getStorage(StorageKeys.accessToken);
      if (token) {
        const { valid } = await validateToken({ token, domain });
        if (valid) {
          setIsAuthenticated(true);
          setIsReady(true);
          return;
        } else {
          // try to refresh if token is invalid
          const refresh = await refreshToken();
          if (!refresh.success) {
            setIsAuthenticated(false);
            setIsReady(true);
            return;
          }

          setIsAuthenticated(true);
          setIsReady(true);
          return;
        }
      } else {
        setIsAuthenticated(false);
        setIsReady(true);
        return;
      }
    };

    checkAuthentication();
  }, []);

  /**
   * Process token response and store tokens in storage
   * @param {TokenResponse} response
   * @returns {Promise<void>}
   */
  const processTokenResponse = async (
    response: TokenResponse
  ): Promise<LoginResponse> => {
    if (!response.accessToken) throw new Error("No access token returned");
    if (response.idToken) {
      const idTokenValidationResult = await validateToken({
        token: response.idToken,
        domain: domain,
      });
      if (idTokenValidationResult.valid) {
        await setStorage(StorageKeys.idToken, response.idToken);
      } else {
        await setStorage(StorageKeys.idToken, null);
        return {
          success: false,
          errorMessage: `Invalid id token: ${idTokenValidationResult.message}`,
        };
      }
    }

    const accessTokenValidationResult = await validateToken({
      token: response.accessToken,
      domain: domain,
    });

    if (accessTokenValidationResult.valid) {
      await setStorage(StorageKeys.accessToken, response.accessToken);
      setIsAuthenticated(true);
    } else {
      await setStorage(StorageKeys.accessToken, null);
      return {
        success: false,
        errorMessage: `Invalid access token: ${accessTokenValidationResult.message}`,
      };
    }

    // Dont store refresh token on web.
    if (platform !== "web" && response.refreshToken)
      await setStorage(StorageKeys.refreshToken, response.refreshToken);

    return {
      success: true,
      accessToken: response.accessToken,
      idToken: response.idToken!,
    };
  };

  /**
   * authenticate method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const authenticate = async (
    options: Partial<LoginMethodParams> = {}
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

    if (discovery) {
      try {
        const codeResponse = await request.promptAsync(discovery, {
          showInRecents: true,
        });
        if (request && codeResponse?.type === "success" && discovery) {
          const exchangeCodeResponse = await exchangeCodeAsync(
            {
              clientId,
              code: codeResponse.params.code,
              extraParams: request.codeVerifier
                ? { code_verifier: request.codeVerifier }
                : undefined,
              redirectUri,
            },
            discovery
          );

          return processTokenResponse(exchangeCodeResponse);
        }
      } catch (err: any) {
        console.error(err);
        return { success: false, errorMessage: err.message };
      }
    }
    return { success: false, errorMessage: "No discovery document" };
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const login = async (
    options: Partial<LoginMethodParams> = {}
  ): Promise<LoginResponse> => {
    return authenticate({ ...options, prompt: "login" });
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const register = async (
    options: Partial<LoginMethodParams> = {}
  ): Promise<LoginResponse> => {
    return authenticate({ ...options, prompt: "create" });
  };

  /**
   * refresh token method
   * @returns {Promise<LoginResponse>}
   */
  const refreshToken = async (): Promise<LoginResponse> => {
    const refreshToken = await getStorage(StorageKeys.refreshToken);
    if (!refreshToken)
      return { success: false, errorMessage: "No refresh token" };
    if (!discovery)
      return { success: false, errorMessage: "No discovery document" };

    // get accessToken by exchanging refreshToken
    const exchangeCodeResponse = await refreshAsync(
      {
        clientId,
        refreshToken,
      },
      discovery
    );

    console.log("exchangeCodeResponse", exchangeCodeResponse);

    return processTokenResponse(exchangeCodeResponse);
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
        `${discovery?.endSessionEndpoint}?redirect=${redirectUri}`
      );
      await setStorage(StorageKeys.accessToken, null);
      await setStorage(StorageKeys.idToken, null);
      setIsAuthenticated(false);
    };

    return new Promise(async (resolve) => {
      const accesstoken = await getStorage(StorageKeys.accessToken);
      if (accesstoken && discovery) {
        if (revokeToken) {
          revokeAsync(
            { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
            discovery
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
    const token = await getStorage(StorageKeys.accessToken);
    if (!token) return null;

    const { valid } = await validateToken({ token, domain });

    if (!valid) {
      const refresh = await refreshToken();
      console.log("refresh", refresh);
      if (!refresh.success) return null;
      return refresh.accessToken;
    }

    return token;
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
    permissionKey: string
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
    keyName: keyof T
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

  /**
   * Get the current organization code
   * @returns { Promise<string | null> }
   */
  async function getCurrentOrganization(): Promise<string | null> {
    return (
      (await getClaim<{ org_code: string }, string>("org_code"))?.value || null
    );
  }

  /**
   * Get the user organizations
   * @returns { Promise<string[] | null> }
   */
  async function getUserOrganizations(): Promise<string[] | null> {
    return (
      (
        await getDecodedToken<{
          org_codes: string[];
        }>("idToken")
      )?.org_codes || null
    );
  }

  /**
   * Get the value of a feature flag
   * @param name
   * @returns { Promise<T | null> }
   */
  async function getFlag<T = string | boolean | number>(
    name: string
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

  /**
   * Get the user profile
   * @returns { Promise<UserProfile | null> }
   */
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
    refreshToken,

    getAccessToken,
    getIdToken,
    getDecodedToken,

    getPermission,
    getPermissions,

    getClaims,
    getClaim,

    getUserProfile,

    getCurrentOrganization,
    getUserOrganizations,

    getFlag,

    isAuthenticated,
    isReady,
  };

  return (
    <KindeAuthContext.Provider value={value}>
      {children}
    </KindeAuthContext.Provider>
  );
};

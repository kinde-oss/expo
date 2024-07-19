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
} from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import { createContext } from "react";
import { DEFAULT_TOKEN_SCOPES } from "./constants";
import { getStorage, setStorage, StorageKeys } from "./storage";
import {
  LoginResponse,
  LogoutResult,
  PermissionAccess,
  Permissions,
} from "./types";
import { KindeAuthHook } from "./useKindeAuth";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import Constants from "expo-constants";

export const KindeAuthContext = createContext<KindeAuthHook | undefined>(
  undefined,
);

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

  const redirectUri = makeRedirectUri({ native: Constants.isDevice });

  const discovery: DiscoveryDocument | null = {
    ...useAutoDiscovery(domain),
    revocationEndpoint: `${domain}/oauth2/revoke`,
  };

  /**
   * Login method
   * @param {Partial<LoginMethodParams>} options
   * @returns {Promise<LoginResponse>}
   */
  const login = async (
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
      extraParams: mapLoginMethodParamsForUrl(options),
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
            discovery,
          );

          const accessTokenValidationResult = await validateToken({
            token: exchangeCodeResponse.accessToken,
            domain: domain,
          });
          if (accessTokenValidationResult.valid) {
            await setStorage(
              StorageKeys.accessToken,
              exchangeCodeResponse.accessToken,
            );
          } else {
            console.error(
              `Invalid access token`,
              accessTokenValidationResult.message,
            );
          }

          if (exchangeCodeResponse.idToken) {
            const idTokenValidationResult = await validateToken({
              token: exchangeCodeResponse.accessToken,
              domain: domain,
            });
            if (idTokenValidationResult.valid) {
              await setStorage(
                StorageKeys.idToken,
                exchangeCodeResponse.idToken!,
              );
            } else {
              console.error(
                `Invalid id token`,
                accessTokenValidationResult.message,
              );
            }
          }
          return {
            success: true,
            accessToken: exchangeCodeResponse.accessToken,
            idToken: exchangeCodeResponse.idToken!,
          };
        }
      } catch (err: any) {
        console.error(err);
        return { success: false, errorMessage: err.message };
      }
    }
    return { success: false, errorMessage: "No discovery document" };
  };

  /**
   * logout method
   * @returns {Promise<LogoutResult>}
   */
  async function logout(): Promise<LogoutResult> {
    return new Promise(async (resolve) => {
      const accesstoken = await getStorage(StorageKeys.accessToken);
      if (accesstoken && discovery) {
        revokeAsync(
          { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
          discovery,
        )
          .then(async () => {
            await openAuthSessionAsync(
              `${discovery.endSessionEndpoint}?redirect=${redirectUri}`,
            );
            await setStorage(StorageKeys.accessToken, null);
            await setStorage(StorageKeys.idToken, null);
            resolve({ success: true });
          })
          .catch((err: unknown) => {
            console.error(err);
            resolve({ success: false });
          });
      }
      resolve({ success: true });
    });
  }

  /**
   * Get current active access token, returns null if no token found
   * @returns {Promise<string | null>}
   */
  async function getAccessToken(): Promise<string | null> {
    return getStorage(StorageKeys.accessToken);
  }

  /**
   * Get current active it token, returns null if no token found
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
  >(tokenType: "accessToken" | "idToken" = "accessToken") {
    const token =
      tokenType === "accessToken" ? await getAccessToken() : await getIdToken();

    if (!token) {
      return null;
    }
    return jwtDecoder<T>((await getAccessToken())!);
  }

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

  async function getClaims<T = JWTDecoded>(): Promise<T | null> {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    return jwtDecoder<T>(token);
  }

  async function getClaim<T = JWTDecoded>(
    keyName: keyof T,
  ): Promise<string | number | string[] | null> {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    const claims = jwtDecoder<T>(token);
    if (!claims) {
      return null;
    }
    return claims[keyName] as string | number | string[] | null;
  }

  const value: KindeAuthHook = {
    login,
    logout,
    getAccessToken,
    getIdToken,
    getDecodedToken,
    getPermission,
    getPermissions,
    getClaims,
    getClaim,
  };

  return (
    <KindeAuthContext.Provider value={value}>
      {children}
    </KindeAuthContext.Provider>
  );
};

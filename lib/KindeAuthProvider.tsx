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
import { createContext, useEffect, useState } from "react";
import { DEFAULT_TOKEN_SCOPES } from "./constants";
import { getStorage, setStorage, StorageKeys } from "./storage";
import { LoginResponse, LogoutResult } from "./types";
import { KindeAuthHook } from "./useKindeAuth";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import Constants from "expo-constants";
// import { createURL } from "expo-linking";
export const KindeAuthContext = createContext<KindeAuthHook | undefined>(
  undefined,
);

export const KindeAuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [redirectUri, setRedirectUri] = useState<string | undefined>();
  useEffect(() => {
    // http://
    // console.log("use effect");
    // const currentScheme = createURL("/");

    // console.log(currentScheme);
    // if (window.origin) {
    console.log("set RedirectUri");
    setRedirectUri(makeRedirectUri({ native: Constants.isDevice }));
    // }
  }, []);
  // const redirectUri = "exp://192.168.86.49:8081";

  const domain = process.env.EXPO_PUBLIC_KINDE_DOMAIN!;
  const clientId = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID!;
  const scopes =
    process.env.EXPO_PUBLIC_KINDE_SCOPES?.split(" ") ||
    DEFAULT_TOKEN_SCOPES.split(" ");
  const discovery: DiscoveryDocument | null = {
    ...useAutoDiscovery(domain),
    revocationEndpoint: `${domain}/oauth2/revoke`,
  };

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

    console.log("request", request);

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

          if (
            await validateToken({
              token: exchangeCodeResponse.accessToken,
              domain: domain,
            })
          ) {
            await setStorage(
              StorageKeys.accessToken,
              exchangeCodeResponse.accessToken,
            );
          }
          if (
            exchangeCodeResponse.idToken &&
            (await validateToken({
              token: exchangeCodeResponse.idToken,
              domain: domain,
            }))
          ) {
            await setStorage(
              StorageKeys.idToken,
              exchangeCodeResponse.idToken!,
            );
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

  async function logout(): Promise<LogoutResult> {
    const accesstoken = await getStorage(StorageKeys.accessToken);
    console.log("accesstoken", accesstoken);
    console.log("discovery", discovery);
    if (accesstoken && discovery) {
      revokeAsync(
        { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
        discovery,
      )
        .then(async () => {
          console.log("logout success 1");
          await openAuthSessionAsync(
            `${discovery.endSessionEndpoint}?redirect=${redirectUri}`,
          );
          console.log("logout success");
          await setStorage(StorageKeys.accessToken, null);
          await setStorage(StorageKeys.idToken, null);
          return { success: true };
        })
        .catch((err: unknown) => {
          console.error(err);
          return { success: false };
        });
    }
    return { success: true };
  }

  async function getAccessToken(): Promise<string | null> {
    return getStorage(StorageKeys.accessToken);
  }

  async function getIdToken(): Promise<string | null> {
    return getStorage(StorageKeys.idToken);
  }

  async function getDecodedToken(
    tokenType: "accessToken" | "idToken" = "accessToken",
  ) {
    const token =
      tokenType === "accessToken" ? await getAccessToken() : await getIdToken();

    if (!token) {
      return null;
    }
    return jwtDecoder<
      JWTDecoded & {
        permissions: string[];
        org_code: string;
      }
    >((await getAccessToken())!);
  }

  async function getPermission(
    permission: string,
  ): Promise<{ orgCode: string | null; isGranted: boolean }> {
    const token = await getDecodedToken();

    if (!token) {
      return {
        orgCode: null,
        isGranted: false,
      };
    }

    const permissions = token.permissions || [];
    return {
      orgCode: token.org_code,
      isGranted: !!permissions.includes(permission),
    };
  }

  async function getPermissions(): Promise<{
    orgCode: string | null;
    permissions: string[];
  }> {
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

  async function getClaims(): Promise<JWTDecoded | null> {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    return jwtDecoder(token);
  }

  async function getClaim(
    keyName: keyof JWTDecoded,
  ): Promise<string | number | string[] | null> {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    const claims = jwtDecoder(token);
    if (!claims) {
      return null;
    }
    return claims[keyName];
  }

  const value = {
    login,
    logout,
    getAccessToken,
    getIdToken,
    getDecodedToken,
    getPermission,
    getPermissions,
    getClaims,
    getClaim,
    // ... your other exposed methods ...
  };

  return (
    <KindeAuthContext.Provider value={value}>
      {children}
    </KindeAuthContext.Provider>
  );
};

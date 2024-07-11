import {
  makeRedirectUri,
  exchangeCodeAsync,
  DiscoveryDocument,
  useAutoDiscovery,
  AuthRequest,
} from "expo-auth-session";
import { validateToken } from "@kinde/jwt-validator";
import { setItemAsync, getItemAsync, deleteItemAsync } from "expo-secure-store";
import {
  type LoginMethodParams,
  mapLoginMethodParamsForUrl,
} from "@kinde/js-utils";
import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
import { DEFAULT_TOKEN_SCOPES } from "./constants";
import { polyfillWebCrypto } from "expo-standard-web-crypto";

polyfillWebCrypto();

export type LoginSuccessResponse = {
  success: true;
  accessToken: string;
  idToken: string;
};

export type LoginFailureResponse = {
  success: false;
  errorMessage: string;
};

export type LogoutResult = {
  success: boolean;
};

enum StorageKeys {
  accessToken,
  idToken,
  state,
}

export type LoginResponse = LoginSuccessResponse | LoginFailureResponse;

const setStorage = async (key: StorageKeys, value: string | null) => {
  if (!value) {
    await deleteItemAsync(key.toString());
    return;
  }
  if (value.length > 2048) {
    const chunks = value.match(/.{1,2048}/g);
    if (chunks) {
      chunks.forEach(async (chunk, index) => {
        await setItemAsync(`${key}-${index}`, chunk);
      });
    }
  } else {
    await setItemAsync(`${key}-0`, value);
  }
};

const getStorage = async (key: StorageKeys): Promise<string | null> => {
  const chunks = [];
  let index = 0;
  let chunk = await getItemAsync(`${key}-${index}`);
  while (chunk) {
    chunks.push(chunk);
    index++;
    chunk = await getItemAsync(`${key}-${index}`);
  }
  return chunks.join("");
};

export function useKindeAuth() {
  ["EXPO_PUBLIC_KINDE_CLIENT_ID", "EXPO_PUBLIC_KINDE_DOMAIN"].forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`${key} is not set`);
    }
  });

  const domain = process.env.EXPO_PUBLIC_KINDE_DOMAIN!;
  const clientId = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID!;
  const scopes =
    process.env.EXPO_PUBLIC_KINDE_SCOPES?.split(" ") ||
    DEFAULT_TOKEN_SCOPES.split(" ");

  const discovery: DiscoveryDocument = {
    ...useAutoDiscovery(domain),
    revocationEndpoint: `${domain}/oauth2/revoke`,
  };

  const login = async (
    options: Partial<LoginMethodParams> = {},
  ): Promise<LoginResponse> => {
    const request = new AuthRequest({
      clientId,
      redirectUri: makeRedirectUri(),
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
              redirectUri: makeRedirectUri(),
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
            await setStorage(StorageKeys.idToken, exchangeCodeResponse.idToken);
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
    // const redirectUri = makeRedirectUri({
    //   scheme: "myapp",
    //   path: "",
    // });
    // const accesstoken = await getStorage(StorageKeys.accessToken);

    // if (accesstoken && discovery) {
    //   revokeAsync(
    //     { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
    //     discovery,
    //   )
    //     .then(async () => {
    //       await openAuthSessionAsync(
    //         `${discovery.endSessionEndpoint}?redirect=${redirectUri}`,
    //       );
    //       await setStorage(StorageKeys.accessToken, null);
    //       await setStorage(StorageKeys.idToken, null);
    //       return { success: true };
    //     })
    //     .catch((err) => {
    //       console.error(err);
    //       return { success: false };
    //     });
    // }
    // return { success: true };
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

  return {
    login,
    logout,
    getAccessToken,
    getIdToken,
    getPermission,
    getPermissions,
    getClaim,
    getClaims,
    getDecodedToken,
  };
}

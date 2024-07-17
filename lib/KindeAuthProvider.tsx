import { LoginMethodParams, mapLoginMethodParamsForUrl } from "@kinde/js-utils";
// import { validateToken } from "@kinde/jwt-validator";
import {
  AuthRequest,
  CodeChallengeMethod,
  DiscoveryDocument,
  exchangeCodeAsync,
  makeRedirectUri,
  revokeAsync,
  TokenTypeHint,
} from "expo-auth-session";
import Constants from "expo-constants";
import { openAuthSessionAsync } from "expo-web-browser";
import { createContext, useEffect, useState } from "react";
import { DEFAULT_TOKEN_SCOPES } from "./constants";
import { getStorage, setStorage, StorageKeys } from "./storage";
import { LoginResponse, LogoutResult } from "./types";
import { KindeAuthHook } from "./useKindeAuth";

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
    setRedirectUri(makeRedirectUri({ native: Constants.isDevice }));
  }, []);

  const domain = process.env.EXPO_PUBLIC_KINDE_DOMAIN!;
  const clientId = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID!;
  const scopes =
    process.env.EXPO_PUBLIC_KINDE_SCOPES?.split(" ") ||
    DEFAULT_TOKEN_SCOPES.split(" ");
  const discovery: DiscoveryDocument = {
    authorizationEndpoint: `${domain}/oauth2/auth`,
    discoveryDocument: {
      authorization_endpoint: `${domain}/oauth2/auth`,
      claims_supported: ["aud", "exp", "iat", "iss", "sub"],
      code_challenge_methods_supported: [CodeChallengeMethod.S256],
      end_session_endpoint: `${domain}/logout`,
      id_token_signing_alg_values_supported: ["RS256"],
      introspection_endpoint: `${domain}/oauth2/introspect`,
      issuer: `${domain}`,
      jwks_uri: `${domain}/.well-known/jwks`,
      request_uri_parameter_supported: false,
      response_modes_supported: ["form_post", "query", "fragment"],
      response_types_supported: [
        "code",
        "token",
        "id_token",
        "code token",
        "code id_token",
        "id_token token",
        "code id_token token",
      ],
      scopes_supported: [
        "address",
        "email",
        "offline",
        "openid",
        "phone",
        "profile",
      ],
      subject_types_supported: ["public"],
      token_endpoint: `${domain}/oauth2/token`,
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      userinfo_endpoint: `${domain}/oauth2/v2/user_profile`,
    },
    endSessionEndpoint: `${domain}/logout`,
    registrationEndpoint: undefined,
    tokenEndpoint: `${domain}/oauth2/token`,
    userInfoEndpoint: `${domain}/oauth2/v2/user_profile`,
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

          // if (
          //   await validateToken({
          //     token: exchangeCodeResponse.accessToken,
          //     domain: domain,
          //   })
          // ) {
          await setStorage(
            StorageKeys.accessToken,
            exchangeCodeResponse.accessToken,
          );
          // }
          // if (
          //   exchangeCodeResponse.idToken &&
          //   (await validateToken({
          //     token: exchangeCodeResponse.idToken,
          //     domain: domain,
          //   }))
          // ) {
          await setStorage(StorageKeys.idToken, exchangeCodeResponse.idToken!);
          // }
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
    const redirectUri = makeRedirectUri({
      scheme: "myapp",
      path: "",
    });
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
          return { success: true };
        })
        .catch((err) => {
          console.error(err);
          return { success: false };
        });
    }
    return { success: true };
  }

  const value = {
    login,
    logout,
    // ... your other exposed methods ...
  };

  return (
    <KindeAuthContext.Provider value={value}>
      {children}
    </KindeAuthContext.Provider>
  );
};
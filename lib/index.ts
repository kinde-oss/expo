// import {
//   makeRedirectUri,
//   exchangeCodeAsync,
//   DiscoveryDocument,
//   AuthRequest,
//   CodeChallengeMethod,
// } from "expo-auth-session";
// import { validateToken } from "@kinde/jwt-validator";
// import { setItemAsync, deleteItemAsync } from "expo-secure-store";
// import {
//   type LoginMethodParams,
//   mapLoginMethodParamsForUrl,
// } from "@kinde/js-utils";
// // import { JWTDecoded, jwtDecoder } from "@kinde/jwt-decoder";
// import { DEFAULT_TOKEN_SCOPES } from "./constants";
// import Constants from "expo-constants";

// // const getStorage = async (key: StorageKeys): Promise<string | null> => {
// //   const chunks = [];
// //   let index = 0;
// //   let chunk = await getItemAsync(`${key}-${index}`);
// //   while (chunk) {
// //     chunks.push(chunk);
// //     index++;
// //     chunk = await getItemAsync(`${key}-${index}`);
// //   }
// //   return chunks.join("");
// // };

// export function useKindeAuth() {
//   //   if (!window?.location?.origin) {
//   //     return;
//   //   }
//   ["EXPO_PUBLIC_KINDE_CLIENT_ID", "EXPO_PUBLIC_KINDE_DOMAIN"].forEach((key) => {
//     if (!process.env[key]) {
//       throw new Error(`${key} is not set`);
//     }
//   });

//   const domain = process.env.EXPO_PUBLIC_KINDE_DOMAIN!;
//   const clientId = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID!;
//   const scopes =
//     process.env.EXPO_PUBLIC_KINDE_SCOPES?.split(" ") ||
//     DEFAULT_TOKEN_SCOPES.split(" ");

//   console.log(window, window?.location, window?.location?.origin);

//   const redirectUri =
//     typeof window !== "undefined"
//       ? makeRedirectUri({ native: Constants.isDevice })
//       : undefined;

//   if (!redirectUri) {
//     throw new Error("This library only works on a mobile device");
//   }

//   const discovery: DiscoveryDocument = {
//     authorizationEndpoint: `${domain}/oauth2/auth`,
//     discoveryDocument: {
//       authorization_endpoint: `${domain}/oauth2/auth`,
//       claims_supported: ["aud", "exp", "iat", "iss", "sub"],
//       code_challenge_methods_supported: [CodeChallengeMethod.S256],
//       end_session_endpoint: `${domain}/logout`,
//       id_token_signing_alg_values_supported: ["RS256"],
//       introspection_endpoint: `${domain}/oauth2/introspect`,
//       issuer: `${domain}`,
//       jwks_uri: `${domain}/.well-known/jwks`,
//       request_uri_parameter_supported: false,
//       response_modes_supported: ["form_post", "query", "fragment"],
//       response_types_supported: [
//         "code",
//         "token",
//         "id_token",
//         "code token",
//         "code id_token",
//         "id_token token",
//         "code id_token token",
//       ],
//       scopes_supported: [
//         "address",
//         "email",
//         "offline",
//         "openid",
//         "phone",
//         "profile",
//       ],
//       subject_types_supported: ["public"],
//       token_endpoint: `${domain}/oauth2/token`,
//       token_endpoint_auth_methods_supported: ["client_secret_post"],
//       userinfo_endpoint: `${domain}/oauth2/v2/user_profile`,
//     },
//     endSessionEndpoint: `${domain}/logout`,
//     registrationEndpoint: undefined,
//     tokenEndpoint: `${domain}/oauth2/token`,
//     userInfoEndpoint: `${domain}/oauth2/v2/user_profile`,
//   };

//   async function logout(): Promise<LogoutResult> {
//     // const redirectUri = makeRedirectUri({
//     //   scheme: "myapp",
//     //   path: "",
//     // });
//     // const accesstoken = await getStorage(StorageKeys.accessToken);

//     // if (accesstoken && discovery) {
//     //   revokeAsync(
//     //     { token: accesstoken!, tokenTypeHint: TokenTypeHint.AccessToken },
//     //     discovery,
//     //   )
//     //     .then(async () => {
//     //       await openAuthSessionAsync(
//     //         `${discovery.endSessionEndpoint}?redirect=${redirectUri}`,
//     //       );
//     //       await setStorage(StorageKeys.accessToken, null);
//     //       await setStorage(StorageKeys.idToken, null);
//     //       return { success: true };
//     //     })
//     //     .catch((err) => {
//     //       console.error(err);
//     //       return { success: false };
//     //     });
//     // }
//     return { success: true };
//   }

//   //   async function getAccessToken(): Promise<string | null> {
//   //     return getStorage(StorageKeys.accessToken);
//   //   }

//   //   async function getIdToken(): Promise<string | null> {
//   //     return getStorage(StorageKeys.idToken);
//   //   }

//   //   async function getDecodedToken(
//   //     tokenType: "accessToken" | "idToken" = "accessToken",
//   //   ) {
//   //     const token =
//   //       tokenType === "accessToken" ? await getAccessToken() : await getIdToken();

//   //     if (!token) {
//   //       return null;
//   //     }
//   //     return jwtDecoder<
//   //       JWTDecoded & {
//   //         permissions: string[];
//   //         org_code: string;
//   //       }
//   //     >((await getAccessToken())!);
//   //   }

//   //   async function getPermission(
//   //     permission: string,
//   //   ): Promise<{ orgCode: string | null; isGranted: boolean }> {
//   //     const token = await getDecodedToken();

//   //     if (!token) {
//   //       return {
//   //         orgCode: null,
//   //         isGranted: false,
//   //       };
//   //     }

//   //     const permissions = token.permissions || [];
//   //     return {
//   //       orgCode: token.org_code,
//   //       isGranted: !!permissions.includes(permission),
//   //     };
//   //   }

//   //   async function getPermissions(): Promise<{
//   //     orgCode: string | null;
//   //     permissions: string[];
//   //   }> {
//   //     const token = await getDecodedToken();

//   //     if (!token) {
//   //       return {
//   //         orgCode: null,
//   //         permissions: [],
//   //       };
//   //     }

//   //     const permissions = token.permissions || [];
//   //     return {
//   //       orgCode: token.org_code,
//   //       permissions,
//   //     };
//   //   }

//   //   async function getClaims(): Promise<JWTDecoded | null> {
//   //     const token = await getAccessToken();
//   //     if (!token) {
//   //       return null;
//   //     }
//   //     return jwtDecoder(token);
//   //   }

//   //   async function getClaim(
//   //     keyName: keyof JWTDecoded,
//   //   ): Promise<string | number | string[] | null> {
//   //     const token = await getAccessToken();
//   //     if (!token) {
//   //       return null;
//   //     }
//   //     const claims = jwtDecoder(token);
//   //     if (!claims) {
//   //       return null;
//   //     }
//   //     return claims[keyName];
//   //   }

//   return {
//     login,
//     logout,
//     // getAccessToken,
//     // getIdToken,
//     // getPermission,
//     // getPermissions,
//     // getClaim,
//     // getClaims,
//     // getDecodedToken,
//   };
//   //   return {
//   //     login,
//   //     logout,
//   //     getAccessToken,
//   //     getIdToken,
//   //     getPermission,
//   //     getPermissions,
//   //     getClaim,
//   //     getClaims,
//   //     getDecodedToken,
//   //   };
// }

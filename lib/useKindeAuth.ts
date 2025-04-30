import { useContext } from "react";
import {
  LoginResponse,
  LogoutResult,
  PermissionAccess,
  Permissions,
  LogoutRequest,
  UserProfile,
} from "./types";
import { LoginMethodParams, Role } from "@kinde/js-utils";
import { KindeAuthContext } from "./KindeAuthProvider";
import { JWTDecoded } from "@kinde/jwt-decoder";

export interface KindeAuthHook {
  login: (options?: Partial<LoginMethodParams>) => Promise<LoginResponse>;
  register: (options?: Partial<LoginMethodParams>) => Promise<LoginResponse>;
  logout: (options?: Partial<LogoutRequest>) => Promise<LogoutResult>;
  getAccessToken: () => Promise<string | null>;
  getIdToken: () => Promise<string | null>;
  getDecodedToken: () => Promise<
    | (JWTDecoded & {
        permissions: string[];
        org_code: string;
      })
    | null
  >;
  getPermission: (permissionKey: string) => Promise<PermissionAccess>;
  getPermissions: () => Promise<Permissions>;
  getClaims: <T = JWTDecoded>() => Promise<T | null>;
  getClaim: <T = JWTDecoded, V = string | number | string[]>(
    keyName: keyof T,
  ) => Promise<{
    name: keyof T;
    value: V;
  } | null>;
  getCurrentOrganization: () => Promise<string | null>;
  getUserOrganizations: () => Promise<string[] | null>;
  getUserProfile: () => Promise<UserProfile | null>;
  getRoles: () => Promise<Role[]>;
  getFlag: <T = string | boolean | number>(name: string) => Promise<T | null>;
  // refreshToken: () => Promise<RefreshTokenResult>;
  isAuthenticated: boolean;
}

export const useKindeAuthContext = (): KindeAuthHook => {
  const context = useContext<KindeAuthHook | undefined>(KindeAuthContext);
  if (!context) {
    throw new Error("useKindeAuth must be used within a KindeAuthProvider");
  }
  return context;
};

export const useKindeAuth = () => {
  return useKindeAuthContext();
};

import { useContext } from "react";
import {
  LoginResponse,
  LogoutResult,
  PermissionAccess,
  Permissions,
  LogoutRequest,
} from "./types";
import { LoginMethodParams } from "@kinde/js-utils";
import { KindeAuthContext } from "./KindeAuthProvider";
import { JWTDecoded } from "@kinde/jwt-decoder";

export interface KindeAuthHook {
  login: (options: Partial<LoginMethodParams>) => Promise<LoginResponse>;
  logout: (options: LogoutRequest) => Promise<LogoutResult>;
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
  getClaim: <T = JWTDecoded>(
    keyName: keyof T,
  ) => Promise<string | number | string[] | null>;
  isAuthenticated: () => boolean;
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

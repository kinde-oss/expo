export type LoginSuccessResponse = {
  success: true;
  accessToken: string;
  idToken?: string;
};

export type LoginFailureResponse = {
  success: false;
  errorMessage: string;
};

export type LogoutRequest = {
  revokeToken: boolean;
};

export type LogoutResult = {
  success: boolean;
};

export type PermissionAccess = {
  permissionKey: string;
  orgCode: string | null;
  isGranted: boolean;
};
export type Permissions = { orgCode: string | null; permissions: string[] };

export type LoginResponse = LoginSuccessResponse | LoginFailureResponse;

export type RefreshResponse = LoginSuccessResponse | LoginFailureResponse;

export type UserProfile = {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
  picture: string;
};

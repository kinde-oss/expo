export type LoginSuccessResponse = {
  success: true;
  accessToken: string;
  idToken: string;
};

export type LoginFailureResponse = {
  success: false;
  errorMessage: string;
};

export type LogoutRequest = {
  revokeToken: boolean;
};

/**
 * Kinde-owned options for the browser/auth session. This is a stable, intentionally small public
 * surface: it insulates consumers from the underlying Expo AuthSession/
 * WebBrowser types.
 */
export type KindeBrowserOptions = {
  /**
   * iOS: open the auth session with an isolated cookie store
   * (`ASWebAuthenticationSession` ephemeral mode). Suppresses the
   * "<App> Wants to Use ... to Sign In" consent dialog. @default false
   */
  preferEphemeralSession?: boolean;
  /**
   * Android: whether the auth tab is shown in the OS task switcher / recents.
   * @default true
   */
  showInRecents?: boolean;
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

export type UserProfile = {
  id: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  picture?: string;
};

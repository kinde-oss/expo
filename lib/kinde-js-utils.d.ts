declare module "@kinde/js-utils" {
  export type LoginMethodParams = {
    audience?: string | string[];
    clientId?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    connectionId?: string;
    hasSuccessPage?: boolean;
    invitationCode?: string;
    isCreateOrg?: boolean;
    lang?: string;
    loginHint?: string;
    nonce?: string;
    orgCode?: string;
    orgName?: string;
    pagesMode?: string;
    planInterest?: string;
    pricingTableKey?: string;
    prompt?: PromptTypes;
    properties?: Record<string, string>;
    reauthState?: string;
    redirectURL?: string;
    responseType?: string;
    scope?: string[];
    state?: string;
    supportsReauth?: boolean;
    workflowDeploymentId?: string;
  };

  export type UserProfile = {
    id: string;
    givenName?: string;
    familyName?: string;
    email?: string;
    picture?: string;
  };

  export type Role = {
    id: string;
    key: string;
    name: string;
  };

  export type RefreshTokenResult = {
    success: boolean;
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    error?: string;
  };

  export interface SessionManager {
    asyncStore?: boolean;
    getSessionItem(key: string): Promise<string | null> | string | null;
    setSessionItem(key: string, value: string): Promise<void> | void;
    setItems?(items: Record<string, string>): Promise<void> | void;
    removeItems(...keys: string[]): Promise<void> | void;
  }

  export enum PromptTypes {
    none = "none",
    create = "create",
    login = "login",
  }

  export enum PortalPage {
    organizationDetails = "organization_details",
    organizationMembers = "organization_members",
    organizationPlanDetails = "organization_plan_details",
    organizationPaymentDetails = "organization_payment_details",
    organizationPlanSelection = "organization_plan_selection",
    paymentDetails = "payment_details",
    planSelection = "plan_selection",
    planDetails = "plan_details",
    profile = "profile",
  }

  export enum RefreshType {
    refreshToken = 0,
    cookie = 1,
  }

  export enum StorageKeys {
    accessToken = "access_token",
    codeVerifier = "code_verifier",
    idToken = "id_token",
    nonce = "nonce",
    refreshToken = "refresh_token",
    state = "state",
  }

  export const ExpoSecureStore: {
    default(): Promise<new () => SessionManager>;
  };

  export function mapLoginMethodParamsForUrl(
    options: Partial<LoginMethodParams>,
  ): Record<string, string>;

  export function setActiveStorage(storage: SessionManager): void;

  export function setRefreshTimer(
    expiresIn: number,
    callback: () => void | Promise<void>,
  ): void;

  export function refreshToken(args: {
    clientId: string;
    domain: string;
    onRefresh?: (data: RefreshTokenResult) => void;
    refreshType?: RefreshType;
  }): Promise<RefreshTokenResult>;

  export function generatePortalUrl(args: {
    domain: string;
    returnUrl?: string | null;
    subNav?: PortalPage;
  }): Promise<{ url: URL }>;

  export function getClaim<T = Record<string, unknown>, V = unknown>(
    keyName: keyof T,
    tokenType?: "accessToken" | "idToken",
  ): Promise<{ name: keyof T; value: V } | null>;

  export function getClaims<T = Record<string, unknown>>(
    tokenType?: "accessToken" | "idToken",
  ): Promise<T | null>;

  export function getCurrentOrganization(): Promise<string | null>;

  export function getFlag<T = string | boolean | number>(
    name: string,
  ): Promise<T | null>;

  export function getPermission(permissionKey: string): Promise<{
    isGranted: boolean;
    orgCode: string | null;
    permissionKey: string;
  }>;

  export function getPermissions(): Promise<{
    orgCode: string | null;
    permissions: string[];
  }>;

  export function getRoles(): Promise<Role[]>;

  export function getUserOrganizations(): Promise<string[] | null>;

  export function getUserProfile(): Promise<UserProfile | null>;
}

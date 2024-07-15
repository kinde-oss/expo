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

export type LoginResponse = LoginSuccessResponse | LoginFailureResponse;

import { useContext } from "react";
import { LoginResponse } from "./types";
import { LoginMethodParams } from "@kinde/js-utils";
import { KindeAuthContext } from "./KindeAuthProvider";

// Define a more specific type for login options
export interface KindeAuthHook {
  login: (options: Partial<LoginMethodParams>) => Promise<LoginResponse>;
  // Define other functions and their types here
}

// Assuming KindeAuthContext is defined elsewhere and imported
export const useKindeAuthContext = (): KindeAuthHook => {
  const context = useContext<KindeAuthHook | undefined>(KindeAuthContext);
  if (!context) {
    throw new Error("useKindeAuth must be used within a KindeAuthProvider");
  }
  return context;
};

// Export a wrapper function to maintain the original hook name
export const useKindeAuth = () => {
  return useKindeAuthContext();
};

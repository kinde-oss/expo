import { Platform } from "react-native";
import * as Web from "./web";
import * as Native from "./native";

export const setStorage =
  Platform.OS === "web" ? Web.setStorage : Native.setStorage;
export const getStorage =
  Platform.OS === "web" ? Web.getStorage : Native.getStorage;

export enum StorageKeys {
  accessToken,
  idToken,
  state,
}

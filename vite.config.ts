import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: {
    global: "window",
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "lib/index.ts"),
        utils: resolve(__dirname, "lib/utils/index.ts"),
      },
      formats: ["es", "cjs"],
      name: "@kinde/expo",
      fileName: (format, entryName) =>
        format === "es" ? `${entryName}.mjs` : `${entryName}.cjs`,
    },
    target: "esnext",
    outDir: "dist",
    rollupOptions: {
      external: [
        "react",
        "react/jsx-runtime",
        "react-dom",
        "react-native",
        "expo-auth-session",
        "expo-constants",
        "expo-secure-store",
        "expo-web-browser",
        "@kinde/jwt-validator",
      ],
      output: {
        globals: {
          react: "react",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
        },
      },
    },
  },
  resolve: {
    alias: {
      "react-native": "react-native-web",
      src: resolve(__dirname, "./lib"),
    },
    extensions: [".web.js", ".js", ".ts", ".tsx", ".jsx"],
  },
  plugins: [
    react(),
    dts({
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
      exclude: ["**/*.test.tsx", "**/*.test.ts", "**/*.spec.ts"],
    }),
  ],
});

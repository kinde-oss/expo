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
      entry: resolve(__dirname, "lib/main.ts"),
      formats: ["es", "cjs"],
      name: "@kinde/expo",
      fileName: "kinde-expo",
    },
    target: "es2020", // Or use a more specific target based on your needs
    outDir: resolve(__dirname, "../dist"), // Safer path resolution

    rollupOptions: {
      external: ["react", "react/jsx-runtime", "react-dom"],
      output: {
        globals: {
          react: "react",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
        },
      },
    },
  },
  root: "lib",
  resolve: {
    alias: {
      "react-native": "react-native-web",
      src: resolve(__dirname, "./lib"),
    },
    extensions: [".web.js", ".js", ".ts", ".tsx", ".jsx"],
  },
  plugins: [
    dts({ insertTypesEntry: true, outDir: resolve(__dirname, "../dist") }),
    react(),
  ],
});

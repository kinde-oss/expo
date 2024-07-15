import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
      // Add polyfills if you need to support older browsers
      external: ["react", "react-dom"], // Treat these as external dependencies
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
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

import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: {
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, "lib/main.ts"),
      formats: ["es", "cjs"],
      name: "@kinde/expo",
      fileName: "kinde-expo",
    },
    target: "esnext",
    outDir: "../dist",
  },
  root: "lib",
  base: "",
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      src: resolve(__dirname, "./lib")
    },
    extensions: ['.web.js', '.js', '.ts', '.tsx', '.jsx'],
  },
  plugins: [dts({ insertTypesEntry: true, outDir: "../dist" }), react()],

});

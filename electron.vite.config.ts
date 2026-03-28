import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "pathe";

const currentDirectory = import.meta.dirname;

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        output: {
          chunkFileNames: "[name]-[hash].cjs",
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": resolve(currentDirectory, "src/main"),
        "@shared": resolve(currentDirectory, "src/shared"),
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        output: {
          chunkFileNames: "[name]-[hash].cjs",
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
    resolve: {
      alias: {
        "@preload": resolve(currentDirectory, "src/preload"),
        "@shared": resolve(currentDirectory, "src/shared"),
      },
    },
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(currentDirectory, "src/renderer/index.html"),
          "reminder-popup": resolve(currentDirectory, "src/renderer/reminder-popup.html"),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(currentDirectory, "src/renderer/src"),
        "@shared": resolve(currentDirectory, "src/shared"),
      },
    },
  },
});

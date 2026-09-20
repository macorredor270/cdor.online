import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
const usb = process.env.CDOR_ANDROID_USB === "1";

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    host: usb ? "127.0.0.1" : host || false,
    port: 1420,
    strictPort: true,
    hmr: usb
      ? {
          protocol: "ws",
          host: "localhost",
          port: 1421,
          clientPort: 1421
        }
      : host
        ? {
            protocol: "ws",
            host,
            port: 1421
          }
        : undefined,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
});

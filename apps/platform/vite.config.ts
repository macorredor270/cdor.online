import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      paths: {
        // adapter-node 6 dropped the runtime ORIGIN variable; the public
        // origin is now fixed at build time for CSRF checks and event.url.
        // Without it the origin is derived from each request.
        origin: process.env.ORIGIN || undefined
      }
    })
  ],
  ssr: {
    // Hostinger publishes only output_directory for "Other" applications and
    // may omit nested node_modules. Bundle production dependencies into the
    // adapter-node output so the server can always start from build/ alone.
    // Vite's dev SSR runner must keep Better Auth external so its CommonJS
    // dependencies are loaded by Node instead of being evaluated as ESM.
    noExternal: command === "build" ? true : []
  }
}));

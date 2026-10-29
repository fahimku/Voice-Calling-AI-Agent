import { defineConfig } from "vite";
import vinext from "vinext";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { workersCacheCdnAdapter } from "@vinext/cloudflare/cache/workers-cache-cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

export default defineConfig({
  // Cloudflare rejects a Worker whose source maps exceed 60 MiB. The plugin
  // emits maps unless this is false, and `cf deploy` uploads every map it finds.
  build: {
    sourcemap: false,
  },
  environments: {
    rsc: { build: { sourcemap: false } },
    ssr: { build: { sourcemap: false } },
  },
  plugins: [
    tailwindcss(),
    vinext({
      cache: { cdn: workersCacheCdnAdapter() },
      prerender: { routes: "*" },
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});

import { defineConfig } from "vite";
import vinext from "vinext";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { workersCacheCdnAdapter } from "@vinext/cloudflare/cache/workers-cache-cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

export default defineConfig({
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

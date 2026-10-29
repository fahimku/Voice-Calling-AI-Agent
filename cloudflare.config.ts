import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersResponseStoreSelfContainedConfig } from "@vinext/cloudflare/cache/config";

const workerName = "voice-calling-ai-agent";

const responseStore = await createWorkersResponseStoreSelfContainedConfig({
  worker: workerName,
  bucket: "voice-calling-ai-agent-cache-bodies",
});

export default defineConfig({
  worker: defineWorker({
    name: workerName,
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-29",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    cache: responseStore.cache,
    exports: responseStore.exports,
    env: {
      ...responseStore.env,
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});

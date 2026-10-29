import type { NextConfig } from "next";

// `next build` keeps the Docker standalone server. Vite builds for Cloudflare
// write Worker output under .cloudflare/ and have no dist/client to bundle.
const builtByVite = process.argv.some((arg) => {
  const file = arg.replaceAll("\\", "/").split("/").pop() ?? "";
  return file === "vite" || file.startsWith("vite.");
});

const nextConfig: NextConfig = {
  ...(builtByVite ? {} : { output: "standalone" as const }),
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

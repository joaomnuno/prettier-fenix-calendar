import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit dist/standalone/{server.js,dist,node_modules} so the runtime image
  // ships only the server bundle and the packages it actually imports.
  output: "standalone",
};

export default nextConfig;

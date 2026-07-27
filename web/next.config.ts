import type { NextConfig } from "next";

const repositoryBasePath = process.env.GITHUB_ACTIONS ? "/omni-watermark-cleaner" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: repositoryBasePath,
  assetPrefix: repositoryBasePath,
  images: { unoptimized: true },
};

export default nextConfig;

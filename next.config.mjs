import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Static HTML for GitHub Pages, which has no server. Anything that needs one at request time
  // (middleware, redirects, POST routes) does not run there.
  output: 'export',
  // Empty at docs.supergate.cloud, /<repo> on github.io without a custom domain; the deploy
  // workflow sets it.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: { unoptimized: true },
  // Emit dir/index.html so GitHub Pages resolves a section and its pages alike, such as /cloud
  // and /cloud/quickstart.
  trailingSlash: true,
};

export default withMDX(config);

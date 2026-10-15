import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The marketing landing lives elsewhere; this app only serves docs.
  async redirects() {
    return [{ source: '/', destination: '/docs', permanent: false }];
  },
};

export default withMDX(config);

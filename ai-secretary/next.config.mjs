/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Phase 3 (docs/14): 投資機能の Canonical Route は /investing。
      // 旧 /fund は 308 permanent redirect で互換維持。
      {
        source: "/fund",
        destination: "/investing",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

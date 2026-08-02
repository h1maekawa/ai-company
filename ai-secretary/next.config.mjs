/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://platform.twitter.com https://cdn.syndication.twimg.com",
  "style-src 'self' 'unsafe-inline' https://platform.twitter.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://publish.x.com https://platform.twitter.com https://syndication.twitter.com https://cdn.syndication.twimg.com",
  "frame-src https://platform.twitter.com https://syndication.twitter.com https://twitter.com https://x.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};

export default nextConfig;

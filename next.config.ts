import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import packageJson from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function localIpv4Hosts(): string[] {
  const hosts = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) hosts.add(address.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  agentRules: false,
  // Normally `.next`. A folder inside it, like `.next/second`, lets a second dev server run
  // beside the first, which Next refuses when they share one. One beside it reloads forever.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  allowedDevOrigins: localIpv4Hosts(),
  env: {
    APP_VERSION: packageJson.version,
  },
  output: 'standalone',
  // Loaded from node_modules as they are: the HEIC decoder carries its own WebAssembly,
  // and Talk's WebSocket server has optional native parts it looks for at runtime.
  serverExternalPackages: ['heic-decode', 'libheif-js', 'ws'],
  outputFileTracingIncludes: {
    '/': ['./public/**/*'],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Only the suite's own pages may frame it: Files shows PDFs this way.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          // The camera and microphone are for Talk's own pages, never a frame from elsewhere.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

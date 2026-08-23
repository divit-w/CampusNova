import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// The FastAPI backend origin — used for the CSP connect-src allowlist below.
// Falls back to the same dev default used by lib/config.ts.
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000"

// Report-only for now (per Phase 5 "do not break the UI" directive): this ships
// the policy to the browser so violations are visible without ever blocking a
// request. Flip the header key to "Content-Security-Policy" once a reporting
// pass confirms no legitimate resource is denied.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${API_ORIGIN}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@vladmandic/human$": path.resolve(__dirname, "node_modules/@vladmandic/human/dist/human.esm.js"),
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      "@tensorflow/tfjs-node": false,
      "@tensorflow/tfjs-node-gpu": false,
    }
    return config
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)",
          },
          { key: "Content-Security-Policy-Report-Only", value: CSP },
        ],
      },
    ]
  },
}

export default nextConfig

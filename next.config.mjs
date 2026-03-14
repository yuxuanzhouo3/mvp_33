/** @type {import('next').NextConfig} */
const normalizedRegion =
  (process.env.DEPLOYMENT_REGION || process.env.NEXT_PUBLIC_DEPLOYMENT_REGION || 'INTL')
    .toUpperCase() === 'CN'
    ? 'CN'
    : 'INTL'

const nextConfig = {
  // Expose a stable client-safe region so switching DEPLOYMENT_REGION in .env.local is enough.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_REGION: normalizedRegion,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Standalone output is required by Dockerfile (copies .next/standalone and runs server.js)
  output: 'standalone',

  // Performance optimizations for faster dev server
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  turbopack: {
    // Keep build root stable in CI/monorepo-like layouts with multiple lockfiles.
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    // Vercel 限制约 4.5MB，大文件上传应使用云存储直传
    serverActions: {
      bodySizeLimit: '4.5mb',
    },
    // Next.js 16+ 使用 proxyClientMaxBodySize 替代 middlewareClientMaxBodySize
    proxyClientMaxBodySize: '500mb',
  },
}

export default nextConfig

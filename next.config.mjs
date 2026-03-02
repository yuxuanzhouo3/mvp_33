/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 注意：standalone 模式仅用于 Docker 部署，Vercel 部署时会自动使用 serverless 模式
  // output: 'standalone',

  // Performance optimizations for faster dev server
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    // Vercel 限制约 4.5MB，大文件上传应使用云存储直传
    serverActions: {
      bodySizeLimit: '4.5mb',
    },
  },
}

export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 启用 standalone 输出模式（用于 Docker 部署）
  output: 'standalone',
  // Performance optimizations for faster dev server
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    // 增加服务器操作和 API 路由的请求体大小限制为 500MB（支持会员用户上传大文件）
    serverActions: {
      bodySizeLimit: '500mb',
    },
    // 配置 API Routes 的请求体大小限制为 500MB（用于文件上传）
    proxyClientMaxBodySize: '500mb',
  },
  // 配置 API 路由的请求体大小限制
  // 注意：这需要在服务器启动时设置环境变量或使用自定义服务器
  // 对于开发环境，我们使用 experimental 配置
  // 对于生产环境，需要在部署平台（如 Vercel）配置
}

export default nextConfig

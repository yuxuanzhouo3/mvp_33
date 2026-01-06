# 支付环境变量配置

本文档包含从 mvp6 复制的支付相关环境变量配置。

## 环境变量配置

在项目根目录创建 `.env.local` 文件（或 `.env` 文件），并添加以下配置：

```env
# ============================================
# 支付配置 - 从 mvp6 复制
# ============================================

# Stripe 配置 (沙箱测试环境)
# 从 mvp6 复制
STRIPE_SECRET_KEY=sk_test_xxxxx  # 请替换为你的 Stripe 测试密钥
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51SPhe7FKUeg2OuIVQa5ZtAtJ0vF1mU55Cn2hiZ2DcY6LsrehmQNUtpeEGcIwdrxmhQQl3LurUDXGu1OLCMLYbRzy00U2jmgL6K

# PayPal 配置 (沙箱测试环境)
# 从 mvp6 复制
NEXT_PUBLIC_PAYPAL_CLIENT_ID=AYTzR9jSS9PMF3uEO-d83C0s2oNgkkbtrMGT8mRDaeH5hK-VAvMDrghcGGRhLrGzWXd3HMGFVWiFcg0V
PAYPAL_CLIENT_SECRET=EHc8dR50OAx32Zr6Z9b_l9szJuMG9OAYC_bo59aQhup3fOAOunpvDAdUZLGKIvGM2FEZ2AdW5jZA42qD
PAYPAL_MODE=sandbox

# 微信支付配置 (沙箱环境)
# 需要配置以下变量以启用微信支付
# WECHAT_APP_ID=your_wechat_app_id
# WECHAT_MERCHANT_ID=your_wechat_merchant_id
# WECHAT_API_KEY=your_wechat_api_key
# WECHAT_API_V3_KEY=your_wechat_api_v3_key  # 可选
# WECHAT_SANDBOX=true  # 设置为 true 启用沙箱模式，false 为生产模式
# WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/wechat/callback

# 支付宝配置 (沙箱环境)
# 需要配置以下变量以启用支付宝
# ALIPAY_APP_ID=your_alipay_app_id
# ALIPAY_PRIVATE_KEY=your_alipay_private_key
# ALIPAY_PUBLIC_KEY=your_alipay_public_key

# ============================================
# 其他配置
# ============================================

# 前端 URL (用于支付回调)
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3001

# 环境
NODE_ENV=development
```

## 说明

### Stripe 配置
- `STRIPE_SECRET_KEY`: Stripe 服务端密钥（服务端使用）
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe 公开密钥（前端使用，需要 `NEXT_PUBLIC_` 前缀）

### PayPal 配置
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: PayPal 客户端 ID（前端使用，需要 `NEXT_PUBLIC_` 前缀）
- `PAYPAL_CLIENT_SECRET`: PayPal 客户端密钥（服务端使用）
- `PAYPAL_MODE`: 环境模式，`sandbox` 或 `live`

### 微信支付配置
- `WECHAT_APP_ID`: 微信 AppID
- `WECHAT_MERCHANT_ID`: 微信商户号
- `WECHAT_API_KEY`: 微信 API 密钥
- `WECHAT_API_V3_KEY`: 微信 API v3 密钥（可选）
- `WECHAT_SANDBOX`: 是否启用沙箱模式，`true` 或 `false`
- `WECHAT_NOTIFY_URL`: 微信支付回调 URL

### 支付宝配置
- `ALIPAY_APP_ID`: 支付宝 AppID
- `ALIPAY_PRIVATE_KEY`: 支付宝私钥
- `ALIPAY_PUBLIC_KEY`: 支付宝公钥

## 沙箱测试信息

### Stripe 沙箱测试卡
- **卡号**: 4242 4242 4242 4242
- **有效期**: 任意未来日期（如 12/25）
- **CVC**: 任意 3 位数字（如 123）
- **邮编**: 任意 5 位数字（如 12345）

### PayPal 沙箱测试账号
- **邮箱**: sb-lhti947118677@personal.example.com
- **密码**: Ql+QcAl7

## 注意事项

1. **Next.js 环境变量**: 前端可访问的环境变量必须以 `NEXT_PUBLIC_` 开头
2. **安全性**: 生产环境请使用生产环境的密钥，不要使用测试密钥
3. **`.env.local`**: 本地开发时使用 `.env.local`，该文件会被 git 忽略
4. **Vercel 部署**: 在 Vercel 项目设置中添加这些环境变量

## 从 mvp6 复制的配置来源

这些配置来自 `mvp_6-main/解决方案与最终结果.md` 文档中的环境变量配置。




















































































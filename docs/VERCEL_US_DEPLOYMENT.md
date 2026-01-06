# Vercel 美国部署配置说明

## 对话内容总结

根据老板（mornscience）和开发人员（石远胜）的对话，需要完成以下工作：

### 1. 部署目标
- **项目名称**: MVP2
- **部署位置**: 美国 Vercel 账号（yzcmf94@gmail.com）
- **部署方式**: 使用分支部署，避免影响公司其他 30+ 个项目
- **域名配置**: 
  - **国内部署**: https://mornxyz.mornscience.top（已配置，不需要改动）
  - **美国部署**: 需要确认使用哪个域名（见下方说明）

### 2. 账号信息
- **Vercel 账号**: yzcmf94@gmail.com（已登录）
- **项目**: MVP2
- **国内域名**: https://mornxyz.mornscience.top（已配置，国内使用）

### 3. 域名配置说明 ✅

**重要：官网主域名（www.xxx）是公司官网，不能用于部署 MVP2！**

#### 域名分配（已明确）
- **国内部署**: `https://mornxyz.mornscience.top`（子域名，已配置，**不要改动**）
- **美国部署**: **需要使用新的子域名**（格式类似 www.xxx，但实际是子域名）

#### 老板的要求理解
根据对话，老板说"录视频的时候就用那个官网的那个domain啊，就那个www.多少多少那个给我"，这里的意思是：
- **不是**使用官网主域名（www.mornscience.top），因为那是公司官网
- **而是**使用一个**新的子域名**，格式类似 `www.xxx` 或 `mvp2.xxx`
- 例如：`mvp2.mornscience.top` 或 `us.mornscience.top` 或 `www-mvp2.mornscience.top`

#### 美国部署域名配置步骤

**需要在 Vercel 中配置一个新的子域名**：

1. **确认子域名**
   - 向老板确认：美国部署使用哪个子域名？
   - 可能的选项：
     - `mvp2.mornscience.top`
     - `us.mornscience.top`
     - `www-mvp2.mornscience.top`
     - 或其他格式

2. **部署代码到 Vercel**
   - 先推送到分支，Vercel 会自动部署
   - 此时会获得 Vercel 自动生成的域名（如 `mvp2.vercel.app`）用于测试

3. **配置子域名**
   - 在 Vercel 项目设置中进入 **Settings** > **Domains**
   - 点击 **Add Domain**
   - 输入子域名（如 `mvp2.mornscience.top`，具体需向老板确认）
   - 按照 Vercel 的提示配置 DNS 记录：
     - 在域名服务商（如 Cloudflare、阿里云等）添加 CNAME 记录
     - 指向 Vercel 提供的地址（如 `cname.vercel-dns.com`）
   - 等待 DNS 生效（通常几分钟到几小时）

4. **验证域名**
   - 在 Vercel 中看到域名状态变为 "Valid"
   - 访问配置的子域名确认可以访问

#### 最终域名分配
```
国内部署: https://mornxyz.mornscience.top  (子域名，已配置，不变)
美国部署: https://mvp2.mornscience.top     (新子域名，需要在 Vercel 中配置)
         或 https://us.mornscience.top     (具体域名需向老板确认)
```

#### 注意事项
- ⚠️ **确认具体子域名**: 向老板确认美国部署使用哪个子域名（不是主域名！）
- ⚠️ **DNS 配置权限**: 需要域名管理权限来配置 DNS 记录
- ⚠️ **环境变量更新**: 配置好域名后，记得更新环境变量中的 URL

### 4. 环境变量配置

老板会单独提供以下两个支付相关的环境变量，需要添加到 Vercel 项目设置中：

#### Stripe 配置（待老板提供）
```
STRIPE_SECRET_KEY=<老板提供的美国 Stripe Secret Key>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<老板提供的美国 Stripe Publishable Key>
```

#### PayPal 配置（待老板提供）
```
NEXT_PUBLIC_PAYPAL_CLIENT_ID=<老板提供的美国 PayPal Client ID>
PAYPAL_CLIENT_SECRET=<老板提供的美国 PayPal Client Secret>
PAYPAL_MODE=sandbox 或 live（根据老板提供的信息）
```

### 5. 其他必需的环境变量

除了支付配置，还需要确保以下环境变量已配置：

#### Supabase 配置（必需）
```
NEXT_PUBLIC_SUPABASE_URL=<Supabase 项目 URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase Anon Key>
```

#### 强制使用 Global 数据库（重要！）
```
# 设置此变量为 true，强制只使用 Supabase (Global)，不查询 Cloudbase
# 这是美国 Vercel 部署必需的配置
FORCE_GLOBAL_DATABASE=true
```

#### 应用配置
```
# 使用配置好的子域名（配置好域名后更新，具体域名需向老板确认）
NEXT_PUBLIC_APP_URL=https://mvp2.mornscience.top  # 示例，实际域名需确认
FRONTEND_URL=https://mvp2.mornscience.top          # 示例，实际域名需确认
NEXT_PUBLIC_FRONTEND_URL=https://mvp2.mornscience.top  # 示例，实际域名需确认
```

#### OAuth 配置（如果使用）
```
WECHAT_APP_ID=<微信 App ID>
WECHAT_APP_SECRET=<微信 App Secret>
WECHAT_REDIRECT_URI=<回调 URL>
```

## 部署步骤

### 0. 确认域名（重要！）

**重要：官网主域名（www.xxx）是公司官网，不能用于部署 MVP2！**

**需要向老板确认：**
- 美国部署使用哪个**子域名**？
  - 是 `mvp2.mornscience.top`？
  - 还是 `us.mornscience.top`？
  - 还是其他格式的子域名？

确认后，在 Vercel 中配置这个子域名。

### 1. 创建分支（避免影响其他项目）
```bash
# 创建新分支用于部署
git checkout -b deploy-us-vercel
# 或者使用 master/main 区分（根据老板说明）
```

### 2. 在 Vercel 中配置项目
1. 登录 Vercel: https://vercel.com/login
2. 选择 MVP2 项目
3. 进入项目设置（Settings）
4. 进入环境变量（Environment Variables）页面

### 3. 添加环境变量
按照上面的列表添加所有必需的环境变量，特别注意：
- **FORCE_GLOBAL_DATABASE=true**：**必须设置**，这样代码就只使用 Supabase (Global)，不会查询 Cloudbase
- **Stripe 和 PayPal 的变量**：等待老板提供后再添加
- **其他变量**：可以直接从现有配置复制或使用默认值

### 4. 部署
- 推送到分支后，Vercel 会自动部署
- 或者手动在 Vercel Dashboard 中触发部署

### 5. 配置子域名（必需）

**根据老板要求，需要配置子域名用于录视频（不是主域名！）**

1. **先确认子域名**：向老板确认美国部署使用哪个子域名（如 `mvp2.mornscience.top`）

2. 在 Vercel 项目设置中进入 **Settings** > **Domains**
3. 点击 **Add Domain**
4. 输入子域名（如 `mvp2.mornscience.top`，具体域名需向老板确认）
5. 按照 Vercel 的提示配置 DNS 记录：
   - 在域名服务商（如 Cloudflare、阿里云等）添加 CNAME 记录
   - 指向 Vercel 提供的地址（如 `cname.vercel-dns.com`）
6. 等待 DNS 生效（通常几分钟到几小时）
7. 验证域名是否生效：
   - 在 Vercel 中看到域名状态变为 "Valid"
   - 访问子域名确认可以正常访问
8. **更新环境变量**：
   - 将 `NEXT_PUBLIC_APP_URL`、`FRONTEND_URL`、`NEXT_PUBLIC_FRONTEND_URL` 更新为配置好的子域名
   - 重新部署项目使环境变量生效

### 6. 验证部署
- 访问部署后的 URL（Vercel 自动生成的或自定义域名）
- 测试支付功能（使用老板提供的 Stripe/PayPal 配置）
- 使用部署后的域名进行视频录制

## 注意事项

1. **分支策略**: 使用分支部署，不要直接推送到 main/master，避免影响其他项目
2. **环境变量**: Stripe 和 PayPal 的配置需要等待老板提供，其他变量可以先配置
3. **域名配置**:
   - **国内部署**: 使用 https://mornxyz.mornscience.top（已配置，不需要改动）
   - **美国部署**: 使用新的子域名（如 `mvp2.mornscience.top`），**必须在 Vercel 中配置**
     - ⚠️ **不是**官网主域名（www.xxx），那是公司官网
     - 先部署代码，获得 Vercel 自动生成的域名用于测试
     - 然后配置子域名，用于正式录视频
     - 具体子域名需向老板确认
4. **环境变量中的 URL**: 部署后，将 `NEXT_PUBLIC_APP_URL`、`FRONTEND_URL`、`NEXT_PUBLIC_FRONTEND_URL` 设置为实际部署后的 URL
5. **测试**: 部署后需要测试支付功能是否正常工作

## 环境变量检查清单

在 Vercel 项目设置中确认以下变量已配置：

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `FORCE_GLOBAL_DATABASE=true`（**重要！强制只使用 Supabase，不查询 Cloudbase**）
- [ ] `STRIPE_SECRET_KEY`（待老板提供）
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（待老板提供）
- [ ] `NEXT_PUBLIC_PAYPAL_CLIENT_ID`（待老板提供）
- [ ] `PAYPAL_CLIENT_SECRET`（待老板提供）
- [ ] `PAYPAL_MODE`（待老板提供）
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `FRONTEND_URL`
- [ ] `NEXT_PUBLIC_FRONTEND_URL`

## 相关文档

- [Vercel 部署指南](./VERCEL_DEPLOYMENT.md)
- [支付环境变量配置](./PAYMENT_ENV_SETUP.md)


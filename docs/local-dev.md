# Local Development

## Project root

The real Next.js app lives in:

`c:\Users\wdx\Desktop\mvp_33\mvp_33`

The outer `c:\Users\wdx\Desktop\mvp_33` folder is only a wrapper workspace. Running `npm run dev` there will proxy into the real app.

## Quick start

1. Install dependencies:

```powershell
npm install
```

2. Create a local environment file:

```powershell
npm run setup:dev
```

3. Edit `.env.local` and fill the required values for your region.

4. Validate the environment:

```powershell
npm run env:check
```

5. Start the app:

```powershell
npm run dev:cn
```

Or for the international stack:

```powershell
npm run dev:intl
```

If your `.env.local` already contains both `DEPLOYMENT_REGION` and `NEXT_PUBLIC_DEPLOYMENT_REGION`, plain `npm run dev` also works.

## Minimum required variables

### Common

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `FRONTEND_URL`
- `NEXT_PUBLIC_FRONTEND_URL`
- `ADMIN_SESSION_SECRET`

### CN stack

- `DEPLOYMENT_REGION=CN`
- `NEXT_PUBLIC_DEPLOYMENT_REGION=CN`
- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_SECRET_ID`
- `CLOUDBASE_SECRET_KEY`
- `CLOUDBASE_SESSION_SECRET`

### INTL stack

- `DEPLOYMENT_REGION=INTL`
- `NEXT_PUBLIC_DEPLOYMENT_REGION=INTL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Important note

Do not set `NODE_ENV=production` in `.env.local` for local development. `next dev` manages `NODE_ENV` itself.

## Optional integrations

These are not required for the app to boot, but specific features need them:

- Market live search: `SERPER_API_KEY`, `TAVILY_API_KEY`, or `MARKET_LEAD_SOURCE_WEBHOOK_URL`
- WeChat OA direct publishing: `WECHAT_OA_*`
- Douyin direct publishing: `DOUYIN_CLIENT_KEY`, `DOUYIN_CLIENT_SECRET`
- Payment gateways: `WECHAT_*`, `ALIPAY_*`, `STRIPE_*`, `PAYPAL_*`
- AI generation: `DASHSCOPE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
- SMS / RTC: `TENCENT_SMS_*`, `AGORA_*`, `TENCENT_TRTC_*`

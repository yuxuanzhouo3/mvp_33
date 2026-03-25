/**
 * Generate a B2B cooperation contract template as HTML string.
 * The user can download this as an HTML file and open/print from browser.
 */
export function generateContractHTML(companyName: string): string {
  const today = new Date().toISOString().split("T")[0]

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>合作协议 — OrbitChat × ${companyName}</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; line-height: 1.8; }
  h1 { text-align: center; font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  h2 { font-size: 16px; margin-top: 24px; }
  .parties { background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0; }
  .parties p { margin: 4px 0; }
  .signature { margin-top: 60px; display: flex; justify-content: space-between; }
  .signature div { width: 45%; }
  .signature .line { border-bottom: 1px solid #333; height: 40px; margin-top: 8px; }
  .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>企业合作协议 (模板)</h1>

<div class="parties">
  <p><strong>甲方 (服务提供方)：</strong>OrbitChat 团队</p>
  <p><strong>乙方 (合作方)：</strong>${companyName || "____________"}</p>
  <p><strong>签订日期：</strong>${today}</p>
</div>

<h2>第一条 合作内容</h2>
<p>甲方向乙方提供 OrbitChat 即时通讯平台的企业版服务，包括但不限于：即时消息、频道管理、文件共享、音视频通话等功能。双方就具体合作方案、服务范围、定价策略等达成如下协议。</p>

<h2>第二条 合作期限</h2>
<p>本协议自签署之日起生效，有效期为 _____ 年。期满后如双方无异议，自动续约一年。</p>

<h2>第三条 费用与结算</h2>
<p>1. 乙方应按照甲方报价单支付服务费用，具体金额为：¥___________。</p>
<p>2. 付款方式：___________（银行转账 / 在线支付）。</p>
<p>3. 结算周期：___________（月付 / 季付 / 年付）。</p>

<h2>第四条 双方权利与义务</h2>
<p>1. 甲方应保证平台服务的稳定性和安全性，提供必要的技术支持。</p>
<p>2. 乙方应遵守平台使用规范，不得利用平台进行违法活动。</p>
<p>3. 双方应对合作过程中获取的对方商业信息予以保密。</p>

<h2>第五条 违约责任</h2>
<p>任何一方违反本协议条款，应承担相应的违约责任，并赔偿对方因此遭受的直接损失。</p>

<h2>第六条 争议解决</h2>
<p>因本协议引起的争议，双方应友好协商解决；协商不成的，任何一方均可向甲方所在地人民法院提起诉讼。</p>

<div class="signature">
  <div>
    <p><strong>甲方签章：</strong></p>
    <div class="line"></div>
    <p>日期：</p>
  </div>
  <div>
    <p><strong>乙方签章：</strong></p>
    <div class="line"></div>
    <p>日期：</p>
  </div>
</div>

<div class="footer">
  <p>本协议一式两份，甲乙双方各执一份，具有同等法律效力。</p>
  <p>本模板仅供参考，实际合同请咨询法律顾问。</p>
</div>
</body>
</html>`
}

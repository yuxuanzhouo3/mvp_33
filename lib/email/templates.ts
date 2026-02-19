export function getRegisterVerificationTemplate(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .code { font-size: 32px; font-weight: bold; color: #4F46E5; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>注册验证码</h1>
    </div>
    <div class="content">
      <p>您好，</p>
      <p>感谢您注册我们的服务。请使用以下验证码完成注册：</p>
      <div class="code">${code}</div>
      <p>验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
      <p>如果这不是您的操作，请忽略此邮件。</p>
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function getPasswordResetTemplate(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #DC2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .code { font-size: 32px; font-weight: bold; color: #DC2626; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
    .warning { background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>密码重置验证码</h1>
    </div>
    <div class="content">
      <p>您好，</p>
      <p>我们收到了您的密码重置请求。请使用以下验证码继续：</p>
      <div class="code">${code}</div>
      <p>验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
      <div class="warning">
        <strong>安全提示：</strong>如果这不是您的操作，请立即修改密码并检查账户安全。
      </div>
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
  `;
}

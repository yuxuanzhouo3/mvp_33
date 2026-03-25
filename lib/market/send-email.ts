import nodemailer from "nodemailer"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"

interface SendEmailParams {
  to: string
  subject: string
  body: string
  fromName?: string
}

interface SendEmailResult {
  success: boolean
  message: string
  messageId?: string
}

/** Read runtime SMTP overrides set via the profile page */
function getSmtpOverrides(): Record<string, string | undefined> {
  const g = globalThis as unknown as {
    __profileSmtpOverrides?: Record<string, string | undefined>
  }
  return g.__profileSmtpOverrides || {}
}

function getSmtpConfig() {
  const region = resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"
  const overrides = getSmtpOverrides()

  if (region === "INTL") {
    return {
      host: process.env.SMTP_INTL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_INTL_PORT || "465", 10),
      secure: true,
      user: overrides.intl_user || process.env.SMTP_INTL_USER || "",
      pass: overrides.intl_pass || process.env.SMTP_INTL_PASS || "",
    }
  }

  return {
    host: process.env.SMTP_CN_HOST || "smtp.sina.cn",
    port: parseInt(process.env.SMTP_CN_PORT || "465", 10),
    secure: true,
    user: overrides.cn_user || process.env.SMTP_CN_USER || "",
    pass: overrides.cn_pass || process.env.SMTP_CN_PASS || "",
  }
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const config = getSmtpConfig()

  // Graceful degradation: if SMTP not configured, log and return success
  if (!config.user || !config.pass) {
    console.log("[send-email] SMTP not configured. Would have sent:", {
      to: params.to,
      subject: params.subject,
      bodyLength: params.body.length,
    })
    return {
      success: true,
      message: "邮件已记录（SMTP 未配置，未实际发送）",
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })

    const fromName = params.fromName || "OrbitChat Team"
    const info = await transporter.sendMail({
      from: `"${fromName}" <${config.user}>`,
      to: params.to,
      subject: params.subject,
      text: params.body,
      html: params.body.replace(/\n/g, "<br>"),
    })

    console.log("[send-email] Sent successfully:", info.messageId)
    return {
      success: true,
      message: `邮件已发送至 ${params.to}`,
      messageId: info.messageId,
    }
  } catch (error) {
    const errMsg = (error as Error).message || "Unknown error"
    console.error("[send-email] Failed:", errMsg)
    return {
      success: false,
      message: `发送失败: ${errMsg}`,
    }
  }
}

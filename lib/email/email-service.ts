import nodemailer from 'nodemailer';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    console.log('[EmailService] 初始化邮件服务，读取环境变量:', {
      AUTH_EMAIL_SMTP_HOST: process.env.AUTH_EMAIL_SMTP_HOST,
      AUTH_EMAIL_SMTP_PORT: process.env.AUTH_EMAIL_SMTP_PORT,
      AUTH_EMAIL_SMTP_USER: process.env.AUTH_EMAIL_SMTP_USER ? '已设置' : '未设置',
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    });

    this.transporter = nodemailer.createTransport({
      host: process.env.AUTH_EMAIL_SMTP_HOST,
      port: Number(process.env.AUTH_EMAIL_SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.AUTH_EMAIL_SMTP_USER,
        pass: process.env.AUTH_EMAIL_SMTP_PASS,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.AUTH_EMAIL_FROM,
        to,
        subject,
        html,
      });
      console.log(`[EmailService] 邮件发送成功: ${to}`);
    } catch (error) {
      console.error('[EmailService] 邮件发送失败:', error);
      throw new Error('邮件发送失败');
    }
  }
}

export const emailService = new EmailService();

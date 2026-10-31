import nodemailer from "nodemailer";
import type { MailMessage, MailTransport } from "./transport";

export type SmtpConfiguration = Readonly<{
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  connectionTimeoutMs: number;
}>;

export class SmtpMailTransport implements MailTransport {
  private readonly transporter;

  constructor(private readonly configuration: SmtpConfiguration) {
    this.transporter = nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.port === 465,
      auth: {
        user: configuration.user,
        pass: configuration.password
      },
      connectionTimeout: configuration.connectionTimeoutMs,
      greetingTimeout: configuration.connectionTimeoutMs,
      socketTimeout: configuration.connectionTimeoutMs,
      tls: { minVersion: "TLSv1.2" }
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.configuration.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}

export type MailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
}>;

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

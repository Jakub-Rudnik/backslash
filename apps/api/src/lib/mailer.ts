import nodemailer from "nodemailer";

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export interface Mail extends MailContent {
  to: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

/** `url` is an SMTP URL, e.g. smtps://user:app-password@smtp.gmail.com:465 */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}

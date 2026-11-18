import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html: string };
export type Mailer = (mail: Mail) => Promise<void>;

/** `url` is an SMTP URL, e.g. smtps://user:app-password@smtp.gmail.com:465 */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}

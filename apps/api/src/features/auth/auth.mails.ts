import type { Mail } from "../../lib/mailer.ts";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function resetPasswordMail(name: string, url: string): Omit<Mail, "to"> {
  return {
    subject: "Reset your backslash password",
    text: `Hi ${name},\n\nOpen this link to set a new password:\n${url}\n\nThe link expires in an hour. If you didn't ask for it, ignore this email.\n`,
    html: `<p>Hi ${escapeHtml(name)},</p>
<p><a href="${escapeHtml(url)}">Set a new password</a></p>
<p>The link expires in an hour. If you didn't ask for it, ignore this email.</p>`,
  };
}

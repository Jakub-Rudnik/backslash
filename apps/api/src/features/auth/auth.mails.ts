import type { MailContent } from "../../lib/mailer.ts";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function resetPasswordMail(name: string, url: string): MailContent {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  return {
    subject: "Reset your backslash password",
    text: `Hi ${name},\n\nOpen this link to set a new password:\n${url}\n\nThe link expires in an hour. If you didn't ask for it, ignore this email.\n`,
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Reset your backslash password</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f0;">
<div style="display:none;max-height:0;overflow:hidden;">Set a new password for your backslash account.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="32" height="32" align="center" style="background:#0c0c09;border-radius:8px;color:#c8df4c;font:700 20px/32px ${font};">\\</td>
<td style="padding-left:10px;color:#1c1c17;font:600 17px/32px ${font};">backslash</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4de;border-radius:12px;padding:32px;color:#1c1c17;font:15px/1.6 ${font};">
<h1 style="margin:0 0 16px;font:600 20px/1.3 ${font};">Reset your password</h1>
<p style="margin:0 0 24px;">Hi ${safeName}, someone asked to reset the password for your backslash account. Click the button to choose a new one.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#1c1c17;border-radius:8px;">
<a href="${safeUrl}" style="display:inline-block;padding:12px 20px;color:#fcfcf9;font:600 15px/1 ${font};text-decoration:none;">Set a new password</a>
</td>
</tr></table>
<p style="margin:24px 0 0;color:#6b6b60;font-size:13px;">The link expires in an hour. If you didn't ask for it, ignore this email and your password stays the same.</p>
<p style="margin:16px 0 0;color:#6b6b60;font-size:13px;word-break:break-all;">Button not working? Open this link:<br><a href="${safeUrl}" style="color:#1c1c17;">${safeUrl}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

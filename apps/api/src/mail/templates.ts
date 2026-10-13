/** One email, in plain text and HTML (§7.3). */
export interface Email {
  subject: string;
  text: string;
  html: string;
}

export function verifyEmail(link: string): Email {
  return render({
    subject: 'Confirm your email for Lamp',
    lines: [
      'Confirm this address to back up your notes and sync them between your devices.',
      'The link works for 24 hours, on any device.',
    ],
    action: 'Confirm my email',
    link,
    footer: "If you didn't create a Lamp account, you can ignore this email.",
  });
}

export function resetPassword(link: string): Email {
  return render({
    subject: 'Reset your Lamp password',
    lines: [
      'Someone asked to reset the password of the Lamp account for this address.',
      'The link works for one hour, once. Setting a new password signs out your other devices; their notes stay on them.',
    ],
    action: 'Choose a new password',
    link,
    footer: "If it wasn't you, ignore this email and your password stays the same.",
  });
}

interface Content {
  subject: string;
  lines: string[];
  action: string;
  link: string;
  footer: string;
}

function render({ subject, lines, action, link, footer }: Content): Email {
  const text = [...lines, '', `${action}: ${link}`, '', footer, ''].join('\n');
  const paragraphs = lines.map((line) => `<p>${escape(line)}</p>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="font-family: Georgia, serif; color: #2b2118; background: #f7f1e3; padding: 24px;">
<div style="max-width: 480px; margin: 0 auto;">
${paragraphs}
<p><a href="${escape(link)}" style="display: inline-block; padding: 12px 20px; background: #8c2f1b; color: #fff; text-decoration: none; border-radius: 6px;">${escape(action)}</a></p>
<p style="font-size: 14px;">Or open this link: <br>${escape(link)}</p>
<p style="font-size: 14px; color: #6b5a48;">${escape(footer)}</p>
</div>
</body>
</html>
`;
  return { subject, text, html };
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

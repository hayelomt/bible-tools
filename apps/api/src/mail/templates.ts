/** One email, in plain text and HTML (§7.3). */
export interface Email {
  subject: string;
  text: string;
  html: string;
  /** Extra headers: the weekly email's `List-Unsubscribe` (RFC 8058). */
  headers?: Record<string, string>;
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

/** One group's part of the weekly email: what happened, as the group page says it. */
export interface DigestGroup {
  name: string;
  /** The group's page in the app. */
  link: string;
  /** "Ben replied to your section in The Good Shepherd", latest first. */
  lines: string[];
}

/**
 * The weekly email of group activity (M13-12, wireframes/sharing.md "Notifications"), with a link
 * to stop it in the body and in the headers, so mail apps offer one-click unsubscribe.
 */
export function groupDigest(
  groups: readonly DigestGroup[],
  links: { unsubscribe: string; oneClick: string },
): Email {
  const subject =
    groups.length === 1 ? `This week in ${groups[0]!.name}` : 'This week in your Lamp groups';
  const intro = 'What happened in your Lamp groups this week.';
  const footer = 'You get this because you turned on the weekly email in Settings → Groups.';
  const stop = 'Stop these emails';
  const text = [
    intro,
    '',
    ...groups.flatMap((g) => [
      g.name,
      ...g.lines.map((line) => `- ${line}`),
      `Open ${g.name}: ${g.link}`,
      '',
    ]),
    footer,
    `${stop}: ${links.unsubscribe}`,
    '',
  ].join('\n');
  const sections = groups
    .map(
      (g) => `<h2 style="font-size: 18px; margin: 24px 0 8px;">${escape(g.name)}</h2>
<ul style="padding-left: 20px;">
${g.lines.map((line) => `<li style="margin: 4px 0;">${escape(line)}</li>`).join('\n')}
</ul>
<p><a href="${escape(g.link)}" style="color: #8c2f1b;">Open ${escape(g.name)}</a></p>`,
    )
    .join('\n');
  const html = page(
    subject,
    `<p>${escape(intro)}</p>
${sections}
<p style="font-size: 14px; color: #6b5a48;">${escape(footer)} <a href="${escape(links.unsubscribe)}" style="color: #6b5a48;">${escape(stop)}</a>.</p>`,
  );
  return {
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
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
  const html = page(
    subject,
    `${paragraphs}
<p><a href="${escape(link)}" style="display: inline-block; padding: 12px 20px; background: #8c2f1b; color: #fff; text-decoration: none; border-radius: 6px;">${escape(action)}</a></p>
<p style="font-size: 14px;">Or open this link: <br>${escape(link)}</p>
<p style="font-size: 14px; color: #6b5a48;">${escape(footer)}</p>`,
  );
  return { subject, text, html };
}

function page(subject: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="font-family: Georgia, serif; color: #2b2118; background: #f7f1e3; padding: 24px;">
<div style="max-width: 480px; margin: 0 auto;">
${body}
</div>
</body>
</html>
`;
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

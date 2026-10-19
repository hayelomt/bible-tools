import { describe, expect, it } from 'vitest';
import { groupDigest, resetPassword, verifyEmail } from './templates.js';

const LINK = 'https://lamp.example/verify-email?token=abc&x="<b>"';

describe('email templates', () => {
  it.each([
    ['verification', verifyEmail],
    ['reset', resetPassword],
  ])('the %s email has the link in its text and its HTML', (_, template) => {
    const email = template(LINK);
    expect(email.subject).not.toBe('');
    expect(email.text).toContain(LINK);
    expect(email.html).toContain(
      'https://lamp.example/verify-email?token=abc&amp;x=&quot;&lt;b&gt;&quot;',
    );
    expect(email.html).not.toContain('<b>');
  });

  it('says how long each link works', () => {
    expect(verifyEmail(LINK).text).toContain('24 hours');
    expect(resetPassword(LINK).text).toContain('one hour');
  });

  it('the weekly email lists each group, escaped, with a way to stop it', () => {
    const links = {
      unsubscribe: 'https://lamp.example/unsubscribe?token=t',
      oneClick: 'https://lamp.example/api/email/unsubscribe?token=t',
    };
    const one = groupDigest(
      [
        {
          name: 'Thursday <group>',
          link: 'https://lamp.example/groups/g',
          lines: ['Ben asked “Why <b>?”'],
        },
      ],
      links,
    );
    expect(one.subject).toBe('This week in Thursday <group>');
    expect(one.text).toContain('- Ben asked “Why <b>?”');
    expect(one.text).toContain(`Stop these emails: ${links.unsubscribe}`);
    expect(one.html).toContain('Thursday &lt;group&gt;');
    expect(one.html).not.toContain('<b>');
    expect(one.headers).toEqual({
      'List-Unsubscribe': `<${links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    const two = groupDigest(
      [
        { name: 'A', link: 'https://lamp.example/groups/a', lines: ['x'] },
        { name: 'B', link: 'https://lamp.example/groups/b', lines: ['y'] },
      ],
      links,
    );
    expect(two.subject).toBe('This week in your Lamp groups');
  });
});

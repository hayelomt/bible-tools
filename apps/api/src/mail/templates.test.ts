import { describe, expect, it } from 'vitest';
import { resetPassword, verifyEmail } from './templates.js';

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
});

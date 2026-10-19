import { createFileRoute, Link } from '@tanstack/react-router';
import { DocPage, DocSection, privacyAddress } from '@/components/doc-page.tsx';

export const Route = createFileRoute('/_app/privacy')({
  staticData: { title: 'Privacy', back: '/settings' },
  component: Privacy,
});

/**
 * The privacy note (PRD *Open questions*, M13-05): what is stored, who can see it and how to
 * delete it, share links and groups included. Bundled with the app, so it reads offline and names
 * whichever server it came from. The operator's side is docs/OPERATIONS.md.
 */
function Privacy() {
  const host = location.hostname;
  const address = privacyAddress();
  return (
    <DocPage>
      <p>
        Lamp keeps your notes on your study of the Bible. This page says what it stores, who can see
        it and how to delete it. Lamp is open-source software; this copy is run from{' '}
        <strong>{host}</strong>, and whoever runs it looks after the server and what’s on it.
      </p>

      <DocSection title="Without an account">
        <p>
          Everything stays on this device, in the browser’s storage: your notes, highlights,
          settings and the Bible text. Nothing is sent to the server. Settings → Storage → Remove
          notes from this device deletes it all.
        </p>
      </DocSection>

      <DocSection title="With an account">
        <p>Signing in copies your notes to the server, so your devices stay in step. It stores:</p>
        <ul>
          <li>your email address and a hash of your password (never the password itself);</li>
          <li>
            your notes: lessons, sections, takeaways, questions, tags, highlights, memory verses,
            inbox items, templates and settings;
          </li>
          <li>
            the devices you sync from, by browser and system (“Chrome on Android”), with the app’s
            version and when each last synced;
          </li>
          <li>your signed-in sessions, with the browser each one is in;</li>
          <li>the share links you make, and when each was last opened;</li>
          <li>the groups you belong to, and the name you use in each.</li>
        </ul>
        <p>
          Notes are not end-to-end encrypted: they are sent over HTTPS and kept in the server’s
          database, which its operator can reach. The operator doesn’t read them, except to fix a
          problem you’ve asked them to look at, or when the law requires it.
        </p>
      </DocSection>

      <DocSection title="What Lamp doesn’t collect">
        <ul>
          <li>No analytics, advertising or tracking. The one cookie keeps you signed in.</li>
          <li>The server’s logs never hold what you write.</li>
          <li>
            When the operator has turned on error reports, they go to Sentry with your notes, email
            address, passwords and links taken out.
          </li>
          <li>
            Email is only for verifying your address, resetting your password and, if you turn it
            on, a weekly summary of your groups. It is sent through Resend.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Share links">
        <p>
          A share link lets anyone who has it read one lesson, series, commentary or handout,
          without an account. It shows that and nothing else: links in it to your other notes show
          as plain text. Shared pages ask search engines not to list them and set no cookies.
        </p>
        <p>
          A frozen link keeps a copy of the page as it was when you made it, and a live one shows
          your notes as they are now. Revoking a link, or letting it expire, stops it working at
          once, but anyone who opened it may have kept what they read. Your links are listed in{' '}
          <Link to="/settings/shared-links">Settings → Shared links</Link>.
        </p>
      </DocSection>

      <DocSection title="Groups">
        <p>When you join a group, its other members see:</p>
        <ul>
          <li>the name you chose for that group (never your email address);</li>
          <li>the sections and questions you add to a group thread, and your comments;</li>
          <li>the lessons of a series shared into the group: titles, details and main passages.</li>
        </ul>
        <p>
          Everything else stays yours: your own notes on a group’s lessons, and all your other
          lessons, tags, highlights and memory verses never reach other members.
        </p>
        <p>
          When you leave a group, or its owner removes you, what you added to its threads goes back
          to your own notes, private again, and your comments are deleted. Other members’ devices
          remove them at their next sync. As with any message, someone may have copied what they
          read first.
        </p>
      </DocSection>

      <DocSection title="Deleting your data">
        <ul>
          <li>
            A note you delete is removed from your devices and the server; the server keeps only a
            marker that it was deleted, so your other devices remove it too.
          </li>
          <li>
            Settings → Delete account removes your account and everything in it from the server at
            once, and ends every session. Copies on your devices stay until you remove them there.
          </li>
          <li>
            The server is backed up nightly, and backups are kept for 14 days, so deleted data is
            gone from them within 14 days.
          </li>
          <li>
            If you can’t sign in, write to <a href={`mailto:${address}`}>{address}</a> from the
            account’s address, and the operator will delete it for you.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Reporting a problem">
        <p>
          To report a shared page or something in a group that shouldn’t be there, or to ask about
          your data, write to <a href={`mailto:${address}`}>{address}</a>.
        </p>
      </DocSection>
    </DocPage>
  );
}

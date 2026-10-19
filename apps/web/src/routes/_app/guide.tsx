import { createFileRoute, Link } from '@tanstack/react-router';
import { DocPage, DocSection } from '@/components/doc-page.tsx';

export const Route = createFileRoute('/_app/guide')({
  staticData: { title: 'User guide', back: '/settings' },
  component: Guide,
});

/**
 * The user guide (M13-05: sharing and groups; the rest is M7-09). Bundled with the app, so it
 * reads offline. Who sees what is the privacy note's.
 */
function Guide() {
  return (
    <DocPage>
      <p>
        Lamp works without an account and offline. Sharing needs an account and a connection, since
        what you share is read from the server. Who can see what is in the{' '}
        <Link to="/privacy">privacy note</Link>.
      </p>

      <DocSection title="Share a link">
        <ul>
          <li>
            Open a lesson, a series or a commentary, tap <strong>⋯</strong> and choose{' '}
            <strong>Share link…</strong>. For a handout, open the lesson’s Export and choose{' '}
            <strong>Share the handout…</strong>.
          </li>
          <li>
            Pick when it expires: never, in 7 or 30 days, or on a day you choose. Then{' '}
            <strong>Create link</strong>, and copy it or share it.
          </li>
          <li>
            A commentary can keep its notes <em>as it is now</em> (later notes won’t show) or stay{' '}
            <em>up to date</em>. A handout is always kept as it was made. Lessons and series show
            your notes as they are now, once they’ve synced.
          </li>
          <li>Anyone with the link can read the page. They can’t edit or comment.</li>
          <li>
            Each one has a single link. Revoke it from the same <strong>⋯</strong>, or from{' '}
            <Link to="/settings/shared-links">Settings → Shared links</Link>, which lists them all
            with when they were made and last opened.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Study with a group">
        <ul>
          <li>
            A group studies one or more series together. Start one from <strong>+ New</strong> under
            Groups on the Lessons screen, or from a series’ <strong>⋯</strong>, then choose the name
            the group will see you by.
          </li>
          <li>
            <strong>Invite people</strong> gives a link to send them. Anyone with it can join, so
            send it only to the people you mean. <strong>Make a new link…</strong> turns the old one
            off.
          </li>
          <li>
            A lesson in a shared series has two threads. The <strong>group thread</strong> is what
            every member sees: add sections and questions there, and comment on others’ sections.{' '}
            <strong>My notes</strong> is yours alone.
          </li>
          <li>
            A section can move between the two from its <strong>⠿</strong> menu: “Share with the
            group” or “Move to my notes”.
          </li>
          <li>
            <strong>Questions</strong> on the group’s page lists open questions across its series,
            with who asked and who answered.
          </li>
          <li>
            <strong>Leave group…</strong> is under Members. What you added goes back to your own
            notes, and your comments are deleted. An owner first makes another member the owner.
          </li>
          <li>
            The owner can remove a member, who loses the group at their next sync, with what they
            added going back to their own notes.
          </li>
        </ul>
      </DocSection>
    </DocPage>
  );
}

# Smoke test

A run through every part of the app at a high level, written for an agent driving a browser
(Playwright or similar). The goal is to find anything plainly broken after a change or a deploy,
not to test edge cases; the automated suites do that. Import and export (the YouVersion import, the
share target, Markdown, Notion, print and handout) are out of scope here.

## Before you start

**Target.** The local dev app (`pnpm dev`: <http://localhost:5173>) by default. Run it against
production (<https://lamp.equipministry.et>) only if you can read the test account's email, or
can verify accounts on the server (`user:verify`, `docs/OPERATIONS.md`).

**Email.** Locally, every email is an `.eml` file in `apps/api/tmp/emails`. The newest one for an
address holds its verification or reset link. In production, mail goes to the real address.

**Accounts.** Make fresh accounts for each run, with the run's date in the address, for example
`smoke.ann.20261019@example.com` and `smoke.ben.20261019@example.com`. Never sign in to a real
person's account. Delete the test accounts at the end (section 15).

**Two widths.** Run on a phone width (390 × 844) and do sections 1 and 3 again at a laptop width
(1280 × 800). Section 11 and the groups need a second browser context, with its own storage.

**What to record.** For each step: pass, or fail with what you saw instead, a screenshot, and any
console errors. Treat as a failure any red error screen, any console error, a request answering
5xx, and a sync status that stays on anything but **Synced** for more than 10 seconds while online.
Don't stop at the first failure. Carry on where the rest of the section doesn't depend on it.

## 0. Preflight

1. `GET /api/health` answers `{"status":"ok","version":…}` with the version you expect.
2. The app loads with no console errors. On a first visit, the welcome screen shows; continue past
   it.

## 1. Shell and appearance (guest)

1. The Lessons home shows an empty state with a way to start a lesson.
2. The navigation reaches every main area (Lessons, Inbox, Read, Search, Review), as a bottom bar
   on a phone and a sidebar on a laptop, and Settings opens from the shell.
3. Settings → Appearance: switching between light, dark and auto changes the colours at once, and
   the choice survives a reload.
4. An unknown address (`/no-such-page`) shows a not-found screen with a way back.

## 2. Lessons, series and sections (guest)

1. Start a new lesson: give it a title. Its date defaults to today.
2. Put it in a new series. The series shows on the Lessons home with "1 lesson", and opens to list
   it.
3. Add three sections. Type `Rom 8:28` into one and accept the suggestion: it becomes a verse chip
   that opens to show the verse.
4. Reply under one section, then drag a section into a new place. Reload: the text, chip, reply
   and order are all kept.
5. Delete a section that has a reply: it asks first. Undo brings it back.
6. Add a tag to a section and to the lesson. The tag's page lists both.
7. Add a takeaway and an open question to the lesson. Answer the question; it shows as answered.

## 3. Offline (guest)

1. Go offline (`context.setOffline(true)`). The app keeps working: open a lesson, add a section,
   start a new lesson.
2. Reload while offline: the app shell loads, and the new notes are there.
3. Go back online. Nothing is lost.

## 4. Finding notes

1. Search for a word from a section: the lesson is in the results, and a result opens the lesson
   at that section.
2. Search for `#` plus the tag from 2.6, and for `Romans 8`: each finds the right notes.
3. Tap the `Rom 8:28` chip and open its verse index: the section is listed.

## 5. Reader, highlights and memory

1. Read → pick a book and chapter. The text shows. Next and previous go through the chapters, and
   the reader reopens at the last place after a reload.
2. Highlight two verses in a colour, with a note on one. Both show highlighted after a reload.
3. Promote the highlight with a note into a lesson: a new section with that verse chip and note
   appears in the lesson you picked.
4. Memorise a verse (from the reader or a chip). It shows in Review → Memory; reveal it and grade
   it.

## 6. Review

1. The Review tab lists open questions, recent takeaways and memory verses due.
2. Park an open question from the queue: it leaves the queue, and shows as parked on its lesson.

## 7. Thinking across notes

1. From the `Rom 8:28` chip, open the compile view for Romans 8. Every section citing Romans 8 is
   listed, grouped under the verse, with the lesson each is from.
2. In a section, type `[[` and pick another lesson: a link chip appears. The other lesson shows it
   under "Linked from".
3. Open a question's page. From a second lesson, revisit it: the question's thread lists both
   lessons, and stays one question.
4. Apply a built-in template (for example SOAP) to a new lesson: its named sections appear.
5. Settings → Templates: make a custom template, apply it to a lesson, then delete it.

## 8. Sermon workflow

1. Open a lesson in capture mode. Add sections quickly, and add a verse from its verse box.
2. Give the lesson a source with a URL. A section captured with a time shows it; tapping the time
   opens the URL at that moment.
3. On the Lessons home, the prep card takes a passage and shows the notes, questions and tags that
   cite it.

## 9. Inbox

1. Add two items to the inbox by hand, one of them a pasted verse text or reference: it becomes a
   chip.
2. Send one to a lesson: it lands as a section there, and leaves the inbox.
3. Snooze the other until a later date: it moves to Snoozed. Bring it back, then dismiss it.

## 10. Looking back

1. From Review, open the theme map. It shows the grid of tags by month and the tags by book, and a
   cell opens its sections.
2. Review shows any resurfaced items without errors. A new account has none, which is fine.

## 11. Accounts and sync

1. Sign up with a new account from Settings. "Check your email" shows. Open the verification link
   from the email: the account is verified, and the guest's notes are now the account's. The status
   says **Synced**.
2. In a second browser context, sign in to the same account. Every lesson, series, highlight and
   memory verse from the first is there.
3. Edit the same section in both while both are offline, then go back online in both. Both end with
   the same notes, and the losing edit is kept as a conflicted copy.
4. Settings → Devices lists both browsers. Sign one out from the other.
5. Change the password. Signing in with the old one fails, and with the new one works.
6. Sign out: the notes stay on the device. **Forgot your password?** sends a reset email whose
   link sets a new password.

## 12. Share links

1. From a synced lesson's ⋯, **Share link…** → **Create link**. Copy the link.
2. In a new browser context with no account, open it. The lesson shows read-only, and no cookies
   are set.
3. Settings → Shared links lists it, opened. Revoke it: reopening the link says it doesn't work any
   more.
4. Signed out or offline, the share dialog says why it can't make a link.

## 13. Groups

Use two verified accounts in two browser contexts, Ann and Ben.

1. Ann: from her series' ⋯, **Study with a group…**, named, with her display name. The group page
   shows the series and **Members · 1**.
2. Ann: **Invite people**, then copy the invite link. Opened signed out, it asks to sign in first.
3. Ben: opens the invite and joins with his display name. He sees the series and its lessons.
4. Ann: in the lesson's group thread, she adds a section, and a private note under **My notes**.
5. Ben: sees Ann's section, never her private note. He comments on it, replies to it, and asks the
   group a question.
6. Ann: the group's row on the Lessons home says how many are new, and the group's Activity lists
   Ben's reply, comment and question. Once she has opened it, the count clears.
7. Ann: from the group's **Questions**, answers Ben's question. Ben sees it answered by Ann.
8. Ben: in Settings → Groups, turns the weekly email on. It stays on after a reload. Opening
   `/unsubscribe?token=not-a-token` and confirming says the link doesn't work.
9. Ann: makes Ben the owner. Ben: removes Ann. At Ann's next sync the group is gone, and her series
   and lesson stay hers.

## 14. Settings and help

1. Settings → **Open in other apps**: hide a target and reorder the rest. A verse chip's "Open in…" follows the
   new order.
2. The privacy note and the user guide open from Settings → About, and read offline too.
3. The status indicator's menu shows **Sync now**, and it works.

## 15. Clean up

1. Delete each test account: Settings → Delete account, with its password. Signing in again then
   fails.
2. On a guest device, Settings → **Remove notes from this device** leaves the empty Lessons home.

## Report

End with a table of every section and step: pass or fail. For each failure, give what you did,
what you expected, what you saw, a screenshot and any console errors or failed requests. Add
anything that seemed slow or confusing even if it passed, marked as a note rather than a failure.

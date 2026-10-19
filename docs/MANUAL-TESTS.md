# Manual tests

Checks that need a real device, a real deployment or a second build, so they can't run in CI. Run
the first one after every deploy, and the others before a release that touches their area. Note the
date, version and device in a "Last run" line under the test's heading.

## After every deploy: accounts, email and sync on the live site

Checks what only the deployed site has: Resend sending real email, the nginx `/api` proxy, the
production database and HTTPS cookies. Sign-up emails failed in production on 2026-10-15 because
the sending domain wasn't verified in Resend; every automated test passed. Use
<https://lamp.equipministry.et> on a laptop and a phone, and an email address you can read.

1. `https://lamp.equipministry.et/api/health` answers `{"status":"ok","version":…}` with the
   version just deployed.
2. On the laptop, in a fresh browser profile: Continue on the welcome, then Settings → **Sign up**
   with a new address (`you+lamp-<date>@gmail.com` works). "Check your email" shows.
3. Within a minute, "Confirm your email for Lamp" arrives from `noreply@lamp.equipministry.et`, in
   the inbox (not spam). Open its link: the app shows the account verified, and the status at the
   top says **Synced**.
   - No email: look in Resend → Emails for the send and its error, and at the API's log
     (`pm2 logs lamp-api` on the server).
4. Start a lesson with a title, a sentence and a verse (`Rom 8:28`, Enter). The status goes back to
   **Synced** within a few seconds.
5. On the phone, open the site, Settings → **Sign in** with the same account: the lesson is there,
   with its verse chip and its text.
6. Add a sentence on the phone. Reload on the laptop (or wait for it to sync): the sentence is
   there. Settings → **Devices** on either lists both, with the version just deployed.
7. Where Sentry is on: in the laptop's DevTools console, run
   `setTimeout(() => { throw new Error('Sentry check') })`. Within a minute the error shows in the
   web project with the release `lamp-web@<version>` and no query string in its URL. An API error
   (any 500 in `pm2 logs lamp-api`) shows in the API project the same way, without its request
   body.
8. Sign out on the phone, then **Forgot your password?** with the same address: "Reset your Lamp
   password" arrives. Its link sets a new password, and signing in with it brings the lesson back.

## The Bible on a phone, offline and in both translations

Checks the Bible download (TECH-DESIGN §9) where E2E can't: a phone's real storage, which Safari
may clear, and a real loss of connection. Use the installed app on an iPhone and an Android phone.

1. On a fresh install, open Settings within a minute: under Bible, the **Berean Standard Bible**
   counts up to 66 books, then shows **3.9 MB ✓**. The **King James Version** shows **Download**.
2. Turn on airplane mode. Open Read, then a book never opened before (Obadiah, Revelation 22): the
   text shows. In a lesson, type `Ps 23:1` and Enter: the chip shows, with the verse text under
   the paragraph.
3. Still offline, Download the KJV: it says the download is paused. Turn airplane mode off: it
   continues, and ends at **4.2 MB ✓**.
4. Pick **KJV**: Read → John 3:16 says "For God so loved the world, that he gave his only begotten
   Son". A new `Jn 3:16` chip says **KJV**; the Psalm chip from step 2 still says **BSB**.
5. Pick **BSB** again: John 3:16 says "that He gave His one and only Son". The KJV row now has
   **Remove**; Remove it, and it shows **Download** again.
6. Leave the app closed for two days, then open it in airplane mode: any book still opens.

## Taking notes on a phone keyboard

Checks verse entry with a real on-screen keyboard, which E2E only imitates (the backlog's M2-13
real-use check builds on this). Use the installed app on an iPhone and an Android phone.

1. Start a lesson and type in the first note: `Paul says in Rom 8:28`. The suggestions show above
   the keyboard and the editing toolbar, never behind them.
2. Tap the first suggestion: the chip "Romans 8:28 · BSB" goes in, the keyboard stays open, and
   the typing goes on after the chip. The verse text shows under the paragraph.
3. Type `jn 3:16` and tap the suggestion: John 3:16. Tap the chip: its text opens, and closing it
   brings the cursor back to the note.
4. With the cursor right after a chip (no space between), one Backspace deletes it whole.
5. Type quickly for a minute, with autocorrect on. Nothing typed is lost or doubled, and the
   cursor never jumps.

## An update mid-edit loses nothing (M2-11)

Checks the update prompt (TECH-DESIGN §8.6). Use a production build, so the service worker runs.

1. `pnpm --filter @lamp/web build && pnpm --filter @lamp/web preview`, and open
   <http://localhost:4573> in Chrome (or the installed app). Wait a few seconds for the service
   worker to install (DevTools → Application → Service workers shows it activated).
2. Start a lesson, give it a title, and type a sentence in the first note. Keep the cursor in the
   note.
3. Make any visible change to the app (for example, the text of the Settings "About" section),
   then run `pnpm --filter @lamp/web build` again. The preview server serves the new files.
4. Still typing in the note, make the app look for the update: DevTools → Application → Service
   workers → **Update**. A new worker shows as "waiting to activate".
   - Keep typing for a few seconds. **No prompt appears** while the note has focus.
5. Click outside the note (the lesson title area). The toast "A new version of Lamp is ready."
   appears, with **Later** and **Reload**.
6. Click **Later**: the toast goes, and nothing reloads. Type a little more, click outside again:
   the toast doesn't come back until the app starts again.
7. Reload the tab yourself with the toast showing again (or close and reopen it), click into the
   note, type one more sentence, click outside, and click **Reload** straight away.
8. The page reloads into the new version (your change from step 3 shows), and **every sentence
   typed in steps 2–7 is in the note**, in order.

Also try it on a phone with the installed app: the same steps, with the update triggered by
closing and reopening the app after step 3.

## Losing the connection mid-edit loses nothing (M3-09)

Checks the sync engine (TECH-DESIGN §6.3) against a real API. Last run 2026-10-13 in the desktop
app's browser, with the API stopped and started for the connection (the Vite proxy then answers
502, which the app takes as offline); results as below.

1. `pnpm dev` with `lamp_dev` migrated. In a fresh browser profile, sign up, open the link from
   `apps/api/tmp/emails/` and verify. The seeded tags are pushed at once (DevTools → Application →
   IndexedDB → `lamp` → `syncState`: `cursor` 24, `ownerUserId` set; `outbox` empty).
2. Start a lesson, give it a title, and type a sentence in the first note. About 2 s after typing
   stops, the outbox is empty again.
3. Keep the cursor in the note and cut the connection: stop the API (or DevTools → Network →
   Offline). Type another sentence, wait a few seconds, then type a third.
   - The note keeps everything typed. The outbox holds one sent change (the sentences typed before
     the failed push, merged) and the changes typed since, not merged with it.
4. Bring the connection back: start the API (a retry comes within the backoff, at most 5 min), or
   go back online in DevTools (at once).
   - The outbox empties, and the server has the note with every sentence, as one section and no
     conflicted copy (`select body from section …` on `lamp_dev`).

## Swiping chapters on a phone (M5-01)

E2E sends made-up touch events; this checks a real finger, where a swipe and a scroll share the
same gesture. Use the installed app on an iPhone and on an Android phone.

1. Open Read, then John 10. Swipe left across the text: John 11 opens at its top.
2. Swipe right: John 10 again. Swipe right on Matthew 1: Malachi 4.
3. Scroll up and down through a chapter, including quick diagonal flicks. **The chapter never
   changes** while scrolling.
4. Press and hold a word to select it, then drag the selection handles sideways. The chapter
   doesn't change.
5. Scroll to the middle of a chapter, wait a second, close the app and open it again on Read: the
   same verse is at the top.

## The weekly reminder on an installed app (M6-04)

Checks Periodic Background Sync (TECH-DESIGN §8.8), which only an installed Chromium app gets and
which Playwright can't drive. Use a production build, so the service worker runs.

1. `pnpm --filter @lamp/web build && pnpm --filter @lamp/web preview`, open
   <http://localhost:4573> in Chrome or Edge, and install it (Install on the toast, or the install
   icon in the address bar). Use the installed app's window from here on.
2. Settings → Review shows **Weekly reminder** with a switch (in a plain tab, or in Firefox or
   Safari, it shows "This browser can't send reminders. The Review tab shows a count instead.").
3. Turn it on. The browser asks to allow notifications; allow. The switch stays on, and after
   closing and reopening the app it's still on. DevTools → Application → Service workers →
   **Periodic Sync** lists `weekly-review`.
4. With no open questions and no verses due, enter `weekly-review` in **Periodic Sync** and click
   it: **no notification**.
5. Add a question to a lesson. Fire `weekly-review` again: a notification "Time to review",
   "1 open question.", and the app's icon shows **1** (taskbar or dock, where the system shows
   badges).
6. Click the notification: the app comes forward on Review.
7. Turn the switch off: `weekly-review` goes from the list. Turn it on after blocking
   notifications for the site (the padlock → Notifications → Block): the switch stays off and says
   "Notifications are blocked for Lamp. Allow them in the browser's site settings."

## The install prompt (Chrome and an iPhone)

Checks the install offer (wireframes/shell.md "Install prompt"), which needs a real install.

1. `pnpm --filter @lamp/web build && pnpm --filter @lamp/web preview`, and open
   <http://localhost:4573> in a new Chrome profile and click Continue on the welcome. Within a few
   seconds, a toast says "Install Lamp to open it from your home screen and use it offline." with
   Not now and Install.
2. Click Not now, and reload: no toast. In DevTools → Application → Local storage, delete
   `lamp.installLater` and reload: the toast is back.
3. Click Install: Chrome's own dialog opens; install. The app's window shows no toast, and neither
   does the tab after a reload.
4. On an iPhone, open the deployed app in Safari: the toast says "Install Lamp: tap Share, then Add
   to Home Screen." OK puts it away. Added to the home screen, the app shows no toast.

## Printing and saving as a PDF in Safari (M6-06)

Checks the print view (TECH-DESIGN §8.7) where E2E can't: E2E runs Chromium only, and Playwright's
WebKit needs a system library this machine lacks. Last run 2026-10-14 in Chromium and Firefox
(Playwright's builds, print media and Chromium's PDF; the page on screen and printed matched, and a
series printed a title page then one page per lesson). Use the installed app, or a production
build, on a Mac in Safari and on an iPhone.

1. With a dark theme, open a lesson that has a verse chip, a reply, takeaways and questions. Turn
   off the connection.
2. `⋯` → **Export…** → **Print or save as PDF**. The print view opens on a white page, and the
   print dialog opens on top.
   - The preview shows only the page: no Back or Print, no navigation, no dark background. The
     verse is quoted in full after its paragraph with "(BSB)", the reply is indented, and
     "Scripture: Berean Standard Bible (public domain)." ends it.
3. Save as PDF (Mac: **PDF** → **Save as PDF**; iPhone: pinch out on the preview, then Share →
   **Save to Files**). The PDF matches the page shown on screen.
4. Close the dialog and reload: it doesn't open again. **Print** opens it.
5. From a series' `⋯` → **Export series…** → **Print or save as PDF**: a title page listing the
   lessons, then each lesson starting on a new page.

## Verses in from other apps, on real phones (M9-07, M9-14)

Checks what E2E only imitates: the share sheet, the YouVersion app's real share and copy, the
clipboard on a phone, and each "Open in…" target opening its own app or site. Use the installed
app (Lamp added to the home screen) on an Android phone and an iPhone, each with the YouVersion app
signed in, and Logos on one of them or on a laptop. Correct the README's share-sheet table from
steps 1 and 3, and fix or log each problem as a task before M10 starts.

1. **Android, share:** in YouVersion open John 10:11 in the BSB, tap the verse → Share. Lamp is in
   the share sheet; pick it. Lamp opens on "Shared to Lamp" with **John 10:11 · BSB** and the
   verse's text. With a lesson opened in the last 10 minutes, **Add to {lesson}** is first, and
   puts it at the end of that lesson. Otherwise **Add to inbox** puts it at the top of the Inbox.
2. **Android, share from another version:** the same with the NIV: the chip says
   **John 10:11 · NIV**, and the text is YouVersion's.
3. **iPhone, share:** in YouVersion, tap the verse → Share. Note whether Lamp is in the share sheet
   (Safari doesn't offer web apps there). Then tap **Copy** instead.
4. **iPhone, Add from clipboard:** in Lamp's Inbox, tap **Add from clipboard** (allow the paste if
   iOS asks). The share screen shows **John 10:11 · BSB** with the copied text.
5. **Paste into a note:** copy a verse in YouVersion again, open a lesson and paste into a note on
   each phone. The text goes in as copied, and a prompt above the keyboard says
   **John 10:11 · BSB** with **Make chip**. Make chip turns it into the chip; Undo (the keyboard's
   undo, or shake on an iPhone) brings the paste back. Paste again and keep typing: the prompt
   goes and the text stays.
6. **Open in…:** tap the chip, then each target under OPEN IN. Each opens John 10:11 (or the
   chapter where the target can't open one verse):
   - Blue Letter Bible and Bible Hub open in the browser;
   - YouVersion opens the app if it's installed, else bible.com, in the BSB;
   - Logos opens the Logos app or its web reader.
   Repeat with a range (`Rom 8:28-30`) and a chapter (`Ps 23`), and note any target that opens the
   wrong place.
7. **Import (once a real export has arrived):** Settings → Import → **Choose file…** with the file
   from YouVersion. The count matches the highlights and notes in YouVersion; the Inbox shows one
   **YouVersion import** row; its `⋯` → **Dismiss all from this import…** asks, and Undo brings
   them back.

## The handout in Safari, and a lesson pasted into Notion (M12-05, M12-06)

Checks the handout (TECH-DESIGN §8.7) in Safari, which E2E can't run, and the Notion export in
Notion itself. E2E prints the handout to PDF in Chromium (one A4 page and one Letter page) and lays
it out for print in Firefox (`handout.spec.ts`). Last run 2026-10-19 in Playwright's Chromium and
Firefox only: ten sections fit at 11 pt with the passage’s text, thirty still at 11 pt, and eighty
left four note headings out at 9 pt, saying so in the bar. Use the installed app, or a production
build, on a Mac in Safari and on an iPhone; and a Notion page in a browser or the Notion app.

1. Open a lesson with a main passage (say John 10:1–18), ten or more sections, takeaways and
   questions. Turn off the connection.
2. `⋯` → **Export…** → **Handout (one page)**. A sheet of paper shows the lesson's details, the
   passage with its text in small type, "Notes" with each section's first line, the takeaways and
   questions, and "Made with Lamp." at the foot. The print dialog opens on top.
3. In the dialog, choose A4, then US Letter: the preview is one page each time, nothing cut off at
   the foot, no Back or Print. Save as PDF and check the PDF has one page.
4. Add sections until the bar says "Too long for one page: … note headings left out.", and print
   again: still one page.
5. **Notion:** turn the connection back on, `⋯` → **Export…** → **Copy for Notion**, and paste into
   an empty Notion page. The title is a heading; each header line is a line of its own; each verse
   chip's text is a quote block with "— John 10:9 (BSB)" under it; a reply is a quote; section
   tags read "Tags: #hope"; Takeaways is a heading over a bulleted list and Questions over to-dos,
   the answered ones ticked. Note anything shown with a stray `\` or `>`, and fix or log it.

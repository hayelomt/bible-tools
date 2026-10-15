# Manual tests

Checks that need a real device, a real deployment or a second build, so they can't run in CI. Run
each one before a release that touches the area, and note the date and device in the PR.

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
   <http://localhost:4573> in Chrome or Edge, and install it (Install on the toast, or the install icon in
   the address bar). Use the installed app's window from here on.
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
   seconds, a toast says
   "Install Lamp to open it from your home screen and use it offline." with Not now and Install.
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

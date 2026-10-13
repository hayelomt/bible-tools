# Manual tests

Checks that need a real device, a real deployment or a second build, so they can't run in CI. Run
each one before a release that touches the area, and note the date and device in the PR.

## An update mid-edit loses nothing (M2-11)

Checks the update prompt (TECH-DESIGN §8.6). Use a production build, so the service worker runs.

1. `pnpm --filter @lamp/web build && pnpm --filter @lamp/web preview`, and open
   <http://localhost:4173> in Chrome (or the installed app). Wait a few seconds for the service
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

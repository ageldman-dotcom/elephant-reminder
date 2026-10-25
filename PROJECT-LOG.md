# The Wife's Elephant Reminder — Project Log

> **If you are an AI assistant reading this file:** this is the authoritative
> record for this project. Read it fully before touching anything. This file is
> the *history and context*; `README.md` beside it is the *technical runbook*.
> Keep both current.
>
> **Standing instruction from the owner (2026-09-10):** append an entry to the
> Update Log at the bottom of this file every time you work on this app.

---

## 1. What this is, in one paragraph

A daily pill-tracking web app built for Noa, the owner's wife. She opens it on
her iPhone and sees one unmistakable answer: has she taken today's pill or not.
She taps once to mark it taken; it resets on its own the next day. It keeps
history, sends reminders she fully controls, and those reminders reach her Apple
Watch. It is installed to her Home Screen as a Progressive Web App, not from the
App Store. The mascot is a cartoon elephant — because an elephant never forgets.

**The hard requirement:** it must keep working until the owner explicitly says
to terminate it. Treat anything that could take it offline as high-stakes.

## 2. Current status — LIVE and working

| Component | Status | Location |
|---|---|---|
| App (PWA) | live | https://ageldman-dotcom.github.io/elephant-reminder/ |
| Setup page for Noa | live | https://ageldman-dotcom.github.io/elephant-reminder/install.html |
| Source repo | public | https://github.com/ageldman-dotcom/elephant-reminder |
| Push scheduler | live | https://elephant-reminder-push.ageldman.workers.dev |
| Noa's device | registered | Apple push endpoint, Hebrew UI, Asia/Jerusalem |
| Her reminder | set by her | 14:00 daily, all 7 days |

Noa installed it, switched the app to Hebrew, and set her own reminder without
instructions. A test push was delivered to her phone on 2026-09-10 (HTTP 201).

## 3. Infrastructure inventory

Everything runs on free tiers with **no credit card and no subscription that can
lapse.** This was deliberate.

**GitHub** — account `ageldman-dotcom`
- Repo `elephant-reminder`, public (required: Pages on free accounts needs public)
- Pages serves branch `main`, folder `/docs`. No CI workflow — fewer moving parts.
- Any push to `main` republishes the app.

**Cloudflare** — worker `elephant-reminder-push`
- Cron `* * * * *` (fires every minute)
- KV namespace binding `SUBS` (id is in `worker/wrangler.toml`)
- workers.dev subdomain: `ageldman`
- Secret `VAPID_PRIVATE_JWK`, set via wrangler; never in the repo

**Secrets** — `secrets/vapid.json`, gitignored. Holds the Web Push signing
keypair. The public half is baked into `docs/app.js` and `worker/wrangler.toml`.
If the private half is lost, regenerate with `node tools/gen-vapid.mjs`, update
both files, redeploy both, and have Noa toggle Reminders off and on to
re-subscribe. Old subscriptions die the moment the key changes.

## 4. What the app actually does

**Today view.** Full-screen state. Pink card plus an elephant holding out a pill
means not taken. Tap "I took it" and the elephant throws its trunk up with
sparkles, the card turns green, and it shows the time. Designed so the answer is
readable at a glance, from colour and shape alone.

**Undo, not confirm.** After marking, a 60-second Undo ribbon appears.
Reasoning: a mis-tap that falsely reads "taken" is more dangerous than a missed
reminder, because she would skip a real dose. An undo is safer than a
confirmation dialog and far less annoying day to day.

**Day rolls over at 04:00, not midnight** (configurable 00:00–06:00). If she ever
takes it at 23:40, midnight would file it under the wrong day and then show
"not taken" for a day she actually covered.

**History.** Month grid of dots — filled green means taken, hollow ring means
marked later, dashed means not marked. Tap any past day to backfill it;
backfilled days are recorded as `late: true` so the record stays honest. Stats:
taken this month, best streak, adherence percentage. CSV export for a doctor.

**Reminders.** Fully her control: any number per day, any times, individually
editable, all pauseable. Each reminder is either **weekly** (chosen weekdays) or
a **one-off on a date**, and each can **repeat every N minutes, up to N more
times**, until she marks it taken. They **all stop for the day the moment she
marks the pill taken** — there is one "taken" per day, so it does not matter
which reminder prompted her. Wording escalates by how many have already been
sent that day: gentle, then still pending, then last call.

**"Remind me again" (second timer, added 2026-10-25 at Noa's request).** A
button on the Today screen, under "I took it", for when the 14:00 notification
arrives at a bad moment. Quick picks +30 min / +1 hour / +2 hours or any time;
it creates a one-off reminder for today. It can also be preset in Settings in
the morning for any later time. Once set, the button reads "Extra reminder at
HH:MM · change". Finished one-offs delete themselves.

**Not possible on iPhone:** custom volume or sound, and buttons on the
notification. Web apps get the system sound at the phone's volume (on/off only,
in iPhone Settings → Notifications → Elephant). The editor says so.

**Refill tracking.** Counts down pills remaining, warns at a threshold she sets,
"I opened a new pack" resets it.

**Backup.** Saves her whole history to a JSON file via the iOS share sheet
(intended destination: iCloud Drive). This is also how a new phone inherits her
history, and how the owner can inspect her data if something breaks.

**Two themes, two languages.** "Soft" (blush and sage, rounded, playful) and
"Calm" (warm minimal, serif, restrained), switchable in Settings. English and
Hebrew with full RTL, switchable. Timezone auto-detected from the phone.

## 5. Architecture, and why each choice was made

The durability requirement drove everything:

| Decision | Reason |
|---|---|
| Plain HTML/CSS/JS. No framework, no build step, no CDN, no npm | Nothing to rot. The files that ship are the files that run. It will still open in a browser in ten years. |
| GitHub Pages from `/docs` | Static files on a CDN. No server process, no cert renewal, no CI action that could be deprecated. |
| Data in `localStorage` on her phone only | No database to maintain, nothing to leak. Home-screen web apps are exempt from Safari's 7-day storage wipe (verified), so it persists. |
| Cloudflare Worker for push | The only always-on piece. Free tier, no card, no expiry. |
| Web Push written by hand from the RFCs | Zero npm dependencies in the worker. Nothing to go unmaintained. |
| `.ics` calendar export as a second reminder path | Runs entirely on her phone. If the worker ever dies, reminders keep firing. |

**Failure posture:** if GitHub and Cloudflare both vanished tomorrow, the app
would still open from her Home Screen, still show today's status, and still
record doses, because the service worker caches it. Only server-pushed reminders
would stop, and the calendar export covers that gap.

**Privacy posture:** the worker stores *only* the reminder schedule, the
timezone, and a single `suppressUntil` timestamp. No history, no name, no record
of which past days were taken. There is no monitoring feature — the owner
explicitly chose "basically entirely hers," with access only via a backup file
she chooses to share.

### How the reminder pipeline works

1. Noa enables Reminders. The app asks iOS for permission, gets a push
   subscription, and POSTs it to the worker with her schedule and timezone.
2. The worker's cron fires every minute, converts "now" into her local time, and
   sends a push if a reminder is due and has not already been sent today.
3. The service worker displays it. iOS mirrors it to her Apple Watch.
4. When she marks the pill taken, the app sends one `suppressUntil` timestamp.
   The worker stays silent until the day rolls over.

## 6. How the requirements were established

The owner gave a detailed brief and explicitly asked for clarifying questions
and improvement suggestions before any code was written. Decisions reached:

- **Reminder delivery:** push notifications *plus* calendar export as a
  serverless fallback. Chosen over push-only or calendar-only.
- **Hosting:** the owner asked whether it could run on his always-on home PC.
  Advised against, and he agreed. Reasons: HTTPS is mandatory for PWA push, so a
  home PC needs a Cloudflare Tunnel anyway — meaning you depend on Cloudflare
  *plus* the PC instead of Cloudflare *instead of* it; residential ISPs block
  inbound 80/443 and rotate IPs; and Windows Update reboots, power cuts and ISP
  outages are exactly the moments a reminder goes silently missing. The PC keeps
  the master copy of the source instead.
- **Data:** on her phone plus a backup file. Not synced to any cloud.
- **Owner access:** none by default. Recovery only via a backup file she shares.
- **Theme:** wanted "Soft" as default *and* "Calm" available via toggle, plus the
  ability to keep refining the design later through conversation. Themes are
  therefore pure CSS custom properties — restyling is a values edit, not a rewrite.
- **Language:** both English and Hebrew, user-toggleable.
- **Name and mascot:** requested mid-build — "cartoon elephant, cute, Dumbo-like"
  and the name "The Wife's Elephant Reminder".

### Research done before building (all verified, not assumed)

- iOS supports Web Push for PWAs since 16.4, **only** when added to the Home
  Screen. Push is impossible from a Safari tab.
- Those notifications **do** mirror to a paired Apple Watch, exactly like a
  native app's. No separate Watch app needed — that would require a $99/year
  Apple Developer account that expires, contradicting the durability goal.
- Home-screen web apps with `display: standalone` are **exempt** from Safari's
  7-day script-writable-storage wipe.
- Apple reversed its 2024 decision to remove home-screen web apps in the EU;
  PWAs work everywhere.
- iOS gives web apps **no** way to schedule a local notification for later. This
  is why a server is required at all.

## 7. Verification performed

The risky parts were tested rather than assumed:

- **Push encryption round-trip.** A test plays the browser's role: generates a
  subscription, encrypts with the worker's own code, then decrypts with
  independent code. Payload survives intact. Header framing checked.
- **VAPID signing.** The ES256 token verifies against the public key, with the
  correct `aud` for Apple's push service.
- **Scheduling — 12 checks, all passing.** Fires at the right local minute;
  never twice; catches up one missed cron tick but not three; silent once marked
  taken; silent when reminders are off; skips deselected weekdays; uses her
  timezone not UTC; evening reminders fire.
- **Worker HTTP API.** Register, update and unsubscribe all return 200;
  malformed requests return 400.
- **Visual QA.** Screenshotted at true 390px iPhone width in both themes, both
  languages, and all three views.
- **Live deployment.** Every asset returns 200; cron trigger confirmed
  registered; health endpoint responds.

**Not verified (requires her physical device):** that the notification visibly
arrived on the phone and on the Watch. Still worth confirming with her.

## 8. Mistakes made during the build — recorded honestly

A future assistant should know these happened, because two of them fail silently:

1. **The VAPID secret uploaded empty.** A Windows path-escaping bug in a
   `node -e` one-liner meant the private key never reached Cloudflare — and
   wrangler still reported "Success". Caught and re-uploaded with a byte-count
   check. *Lesson: verify what actually got sent, not just the exit message.*
2. **A background watcher never worked.** A top-level `return` inside `node -e`
   is a syntax error, so the watcher crashed every 30 seconds and would silently
   never have fired. *Lesson: check background task output early.*
3. **Screenshot clipping misdiagnosed at first.** Chrome on Windows clamps its
   window to about 500px, so 390px screenshots were cropping a 500px layout. The
   app was fine; the harness was wrong. Fixed by rendering through a fixed-width
   iframe. *Lesson: measure `scrollWidth` against `clientWidth` before "fixing" CSS.*
4. **A stale cache pinned a wrong message.** Noa saw "push notifications are not
   connected yet" and it would have persisted after push went live, because the
   service worker was cache-first. Changed to network-first (3s timeout, cache
   fallback) for HTML/JS/CSS so an untrue message can never stick.
5. **Hebrew weekday picker showed "י" on every button** (found 2026-10-25). The
   code sliced the first two characters of the short weekday name, and every
   Hebrew short name starts "יום". Shipped that way on day one and nobody
   noticed. Fixed with the narrow form (א׳ … ש׳).
6. **The workers.dev subdomain name was chosen without asking.** Cloudflare's
   dashboard links were 404ing, so `ageldman` was registered via API to stop the
   back-and-forth. The owner was told and offered a change.

## 9. Known open items

- **2026-10-25 second-timer release is NOT LIVE yet** — committed locally only.
  Blocked on an expired wrangler login (`npx wrangler login` interactively).
  Deploy order matters: **worker first**, then push the app. The old worker
  strips `date`/`repeatEvery`/`repeatCount`, so a one-off set against it would
  silently never fire. Then send Noa the announcement (wording pending Avi's
  confirmation) with tag `news`.

- Confirm with Noa that the test notification actually appeared on her phone
  **and her Apple Watch**.
- Her 14:00 daily reminder is the real end-to-end test — it should fire on its
  own, in Hebrew, and go quiet once she marks the pill taken.
- She may still see the stale "not connected" note until she fully closes the app
  (swipe up from the app switcher) and reopens it.
- The owner wants the design left open to further refinement through conversation.

## 10. Making changes

Read `README.md` first — it is the runbook.

The two things most easily got wrong:

- **After editing anything in `docs/`, bump `CACHE` in `docs/sw.js`**
  (currently `elephant-v4`; next is `elephant-v5`). Otherwise phones keep serving the old version.
- **Never commit `secrets/`.**

```bash
# app: any push to main republishes it
git add -A && git commit -m "..." && git push

# worker
cd worker && npx wrangler deploy

# send a one-off push to every registered device (testing)
node tools/send-push.mjs "Title" "Body"

# regenerate icons
pwsh tools/make-icons.ps1
```

---

## Update Log

Newest entries at the bottom. One entry per working session.

### 2026-09-10 — Initial build and deployment

- Established requirements through two rounds of questions; researched iOS push,
  Apple Watch mirroring and Safari storage behaviour before writing any code.
- Talked the owner out of self-hosting on his home PC.
- Built the PWA: today/history/settings, two themes, English and Hebrew RTL,
  undo, backfill, refill tracking, backup/restore, CSV and `.ics` export.
- Rebuilt the UI around a cartoon elephant mascot mid-session at the owner's
  request; renamed the app to "The Wife's Elephant Reminder".
- Generated icons from an SVG via headless Chrome.
- Wrote the Cloudflare Worker with hand-rolled RFC 8291 / RFC 8292 Web Push.
- Verified push crypto, VAPID signing and 12 scheduling behaviours.
- Deployed: public GitHub repo plus Pages, Cloudflare Worker plus KV plus cron.
- Fixed a silently-empty secret upload and a cache-staleness bug.
- Noa installed it, switched to Hebrew, set a 14:00 daily reminder.
- Sent her a bilingual "reminders are live" push — accepted, HTTP 201.
- Created this log file at the owner's request, with a standing instruction to
  update it after every future session.

### 2026-10-25 — Second timer ("Remind me again")

- Noa asked for a second, independent reminder she controls fully, for when
  the 14:00 one arrives at a bad moment, also presettable earlier in the day.
  Both must stop once she marks the pill taken.
- Clarified with Avi: "how many times" means **repeat every N min until taken**;
  it lives on the **Today screen and in Settings**; the existing 14:00 reminder
  gets **the same options**. Told him volume and notification buttons are not
  possible for iPhone web apps.
- Reminder items gained `date` (one-off), `repeatEvery`, `repeatCount`; old
  saved items are normalised on load. Worker: new `dueFires()` handles dates,
  repeats and repeats past midnight; dedupe keys are now
  `<id>#<repeat>#<calendar date>` with old-format entries pruned; same-minute
  reminders collapse into one push; escalation counts pushes sent today.
- `.ics` export handles one-offs and adds an alarm per repeat.
- Service worker honours a `tag` in the push payload; `tools/send-push.mjs`
  takes an optional third argument for it, so announcements do not replace
  reminders. Badge only set by real reminders. `CACHE` → `elephant-v4`.
- Fixed the Hebrew weekday picker (see section 8).
- Verified: 13 worker scheduling checks in a fake KV (old-format 14:00 fires
  once, one-offs only on their date, taken silences both including one set
  before 14:00, repeats and stopping, catch-up, same-minute merge, past
  midnight, weekday skip, disabled, input sanitising); browser test at 390px in
  Hebrew of the Today button, quick sheet and full editor, no horizontal
  overflow. Not verified on her phone yet.
- **Not deployed** — see section 9.

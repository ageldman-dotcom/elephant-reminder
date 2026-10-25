# The Wife's Elephant Reminder

A one-tap daily pill tracker for Noa's iPhone. Opens to a single unmistakable
answer — taken today, or not yet — with history, reminders that reach the Apple
Watch, and no way to mark a dose except by her tapping the button.

**Live app:** https://ageldman-dotcom.github.io/elephant-reminder/
**Setup page to send her:** https://ageldman-dotcom.github.io/elephant-reminder/install.html

---

## Why it is built this way

The brief was that it has to keep working for years without maintenance. Every
structural decision follows from that:

| Decision | Reason |
|---|---|
| Plain HTML/CSS/JS, no framework, no build step, no CDN | Nothing to rot. The files that ship are the files that run. |
| GitHub Pages from `/docs` on `main` | Static files on a CDN. No server process, no certificate renewal, no CI workflow that could be deprecated. |
| Her data in `localStorage` on her phone | No database to maintain, nothing to leak. Home-screen web apps are exempt from Safari's 7-day storage wipe, so it persists. |
| Push scheduler on Cloudflare Workers free tier | No credit card, no expiry. It is the only always-on piece. |
| Web Push implemented by hand from the RFCs | Zero npm dependencies in the worker. |
| Calendar (`.ics`) export as a second reminder path | Runs entirely on her phone. If the worker ever dies, reminders keep firing. |

If both cloud services vanished tomorrow, the app would still open from her home
screen, still show today's status, and still record doses — because the service
worker caches it. Only server-pushed reminders would stop.

## Layout

```
docs/                     the app — this is what GitHub Pages serves
  index.html              the three views (today / history / settings)
  app.js                  all logic; CONFIG at the top holds the two deploy values
  styles.css              themes as CSS variables: "soft" and "calm"
  sw.js                   offline cache + push receipt
  install.html            the page to send Noa
  icons/                  generated, do not hand-edit
worker/
  src/index.js            push scheduler (fetch API + once-a-minute cron)
  wrangler.toml           worker config; VAPID public key lives here
tools/
  gen-vapid.mjs           regenerates the push keypair
  icon.html, make-icons.ps1   regenerates the icons
secrets/                  gitignored — the VAPID private key
```

## How the reminder pipeline works

1. Noa turns Reminders on. The app asks iOS for permission and gets a push
   subscription, then POSTs it to the worker along with her schedule and timezone.
2. The worker's cron fires every minute, converts "now" into her local time, and
   sends a push if a reminder is due and has not already been sent today.
3. The service worker shows the notification. iOS mirrors it to her Apple Watch.
4. When she marks the pill taken, the app sends the worker a single
   `suppressUntil` timestamp. The worker stays quiet until the day rolls over.

The worker stores **only** the schedule, the timezone, and that one timestamp.
No history, no name, no record of which past days were taken.

Each reminder is weekly (chosen weekdays) or a one-off on a date, and can repeat
every N minutes up to N more times. Marking the pill taken silences all of them
until the day rolls over. The Today screen's "Remind me again" button makes a
one-off for later today.

Reminder text escalates by how many have been sent that day: first is gentle,
second says it is still pending, third is a last call.

**Deploy the worker before the app** whenever the reminder shape changes — the
worker discards fields it does not know, so the app must never be ahead of it.

To send an announcement that does not replace a reminder:
`node tools/send-push.mjs "Title" "Body" news`

---

## Deploying

### The app

Any push to `main` republishes it. GitHub Pages is configured to serve the
`/docs` folder from the `main` branch.

```bash
git add -A && git commit -m "..." && git push
```

After changing any file in `docs/`, bump `CACHE` in `docs/sw.js`
(currently `elephant-v4`) so phones pick up the new version instead of
serving the cached one.

### The worker

Already deployed. Live at **https://elephant-reminder-push.ageldman.workers.dev**
(account `7217d648e886052ac65e3ecbb6fdab7d`, KV namespace `c1aec739ca934432a57b277ca352d765`,
workers.dev subdomain `ageldman`). Redeploy after changing `worker/src/index.js` with
`cd worker && npx wrangler deploy`.

To rebuild it from scratch on a fresh account:

```bash
cd worker
npx wrangler login                                  # opens a browser once
npx wrangler kv namespace create SUBS               # prints an id
# paste that id into wrangler.toml under [[kv_namespaces]]
npx wrangler secret put VAPID_PRIVATE_JWK           # paste privateJwk from secrets/vapid.json, as one line
npx wrangler deploy
```

`wrangler deploy` prints the worker URL. Put it in `docs/app.js` as
`CONFIG.WORKER_URL`, and put the Pages URL in `wrangler.toml` as
`VAPID_SUBJECT`. Commit and push.

Check it is alive: `curl https://<worker-url>/health`

### Rotating the push keys

Only needed if `secrets/vapid.json` leaks or is lost.

```bash
node tools/gen-vapid.mjs
```

Update `VAPID_PUBLIC_KEY` in both `docs/app.js` and `worker/wrangler.toml`, set
the new secret, redeploy both, then have Noa toggle Reminders off and on to
re-subscribe. Old subscriptions stop working the moment the key changes.

### Regenerating the icons

```bash
pwsh tools/make-icons.ps1
```

Renders `tools/icon.html` with whatever Chromium browser is installed.

---

## Tests

There is no test runner. Two scripts verify the parts that fail silently if
wrong — the hand-rolled push crypto, and the scheduling maths. Both live in the
scratchpad rather than the repo; recreate them from the commit history if
needed, or verify by hand:

- `curl https://<worker-url>/health` should return JSON.
- Set a reminder one minute out and confirm the notification arrives.

## Things that will eventually need a human

- **Cloudflare or GitHub changes their free tier.** The app keeps working; only
  push reminders would need rehoming. The calendar export covers the gap.
- **A new iPhone.** Reinstall from the setup page, then Settings → Restore from
  a backup, using the file she saved to iCloud Drive.
- **Reminders stop arriving.** Almost always because the app was opened from
  Safari instead of the home-screen icon, or notifications got denied in iOS
  Settings → Notifications → Elephant.

## Design notes

Two themes, both defined purely as CSS custom properties at the top of
`styles.css` — restyling is a values edit, not a rewrite. The elephant is inline
SVG with one drawing and two moods; the expression, trunk and colour all swap off
`.hero[data-state]`. Interface is English or Hebrew with full RTL.

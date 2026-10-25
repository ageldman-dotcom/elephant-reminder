/* ============================================================
   Elephant Reminder — push scheduler
   Runs on Cloudflare Workers. Two entry points:
     fetch()     — the app registers/updates its schedule here
     scheduled() — fires once a minute and sends due reminders

   Web Push is implemented by hand (RFC 8291 aes128gcm + RFC 8292
   VAPID) using only WebCrypto, so this has no npm dependencies
   that can break or go unmaintained.
   ============================================================ */
'use strict';

const KEY = 'subs';              // single KV blob; this app has one or two users
const CATCHUP_MINUTES = 2;       // tolerate a missed cron tick without double-sending

/* ---------------- small byte helpers ---------------- */
const enc = new TextEncoder();

function b64urlToBytes(s) {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64url(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------------- Web Push crypto ---------------- */

async function hkdf(ikm, salt, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

/** RFC 8291 — encrypt the payload for one subscription. */
export async function encryptPayload(text, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64);   // 65-byte uncompressed point
  const authSecret = b64urlToBytes(authB64);   // 16 bytes

  const as = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, as.privateKey, 256));

  // Combined key derivation: salt is the auth secret, info binds both public keys.
  const keyInfo = concat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(ecdh, authSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt,
    concat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(ikm, salt,
    concat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks this as the last (and only) record.
  const padded = concat(enc.encode(text), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);

  // header: salt | record size | key id length | key id (our public key) | ciphertext
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** RFC 8292 — the signed token that identifies this server to Apple/Google. */
export async function vapidAuth(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT
  };
  const signingInput =
    bytesToB64url(enc.encode(JSON.stringify(header))) + '.' +
    bytesToB64url(enc.encode(JSON.stringify(payload)));

  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']);

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput));

  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Returns 'ok' | 'gone' | 'error'. */
async function sendPush(subscription, payloadObj, env) {
  try {
    const body = await encryptPayload(
      JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth);

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': await vapidAuth(subscription.endpoint, env),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '3600',
        'Urgency': 'high'
      },
      body
    });

    // The push service tells us when a subscription is dead.
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) {
      console.log('push rejected', res.status, (await res.text()).slice(0, 300));
      return 'error';
    }
    return 'ok';
  } catch (e) {
    console.log('push threw', String(e));
    return 'error';
  }
}

/* ---------------- reminder wording ---------------- */
const COPY = {
  en: [
    { title: '🐘 Time for your pill', body: 'Tap when you have taken it.' },
    { title: '🐘 Still waiting…',      body: "Today's pill is not marked yet." },
    { title: '🐘 Last call for today', body: 'Do not forget your pill.' }
  ],
  he: [
    { title: '🐘 זמן לכדור',            body: 'לחצי כאן אחרי שלקחת.' },
    { title: '🐘 עדיין מחכה…',          body: 'הכדור של היום עוד לא סומן.' },
    { title: '🐘 תזכורת אחרונה להיום',  body: 'אל תשכחי את הכדור.' }
  ]
};

/* ---------------- time helpers ---------------- */
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(tz, date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short'
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    dayKey: `${p.year}-${p.month}-${p.day}`,
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
    dow: DOW[p.weekday]
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || 0));

/** Dedupe keys for every firing due right now. A reminder fires at its
 *  time, then again every `repeatEvery` minutes, `repeatCount` more times.
 *  Repeats can run past midnight, so yesterday's reminders are checked too.
 *  Key: `<id>#<repeat index>#<calendar date the reminder belongs to>`. */
export function dueFires(rec, now) {
  const tz = rec.tz || 'UTC';
  const nowMin = localParts(tz, now).minutes;
  const out = [];
  for (const back of [0, 1]) {
    const day = localParts(tz, new Date(now.getTime() - back * 86400000));
    const mins = nowMin + back * 1440;
    for (const it of rec.items || []) {
      const applies = it.date
        ? it.date === day.dayKey
        : Array.isArray(it.days) && it.days.includes(day.dow);
      if (!applies) continue;
      const every = it.repeatEvery > 0 ? it.repeatEvery : 0;
      const count = every ? (it.repeatCount || 0) : 0;
      for (let k = 0; k <= count; k++) {
        const delta = mins - (toMinutes(it.time) + k * every);
        if (delta >= 0 && delta <= CATCHUP_MINUTES) out.push(`${it.id}#${k}#${day.dayKey}`);
      }
    }
  }
  return out;
}

/** Drop dedupe entries older than yesterday (and any in the old format),
 *  so the map stays small without forgetting anything still due. */
function pruneSent(rec, tz, now) {
  const yesterday = localParts(tz, new Date(now.getTime() - 86400000)).dayKey;
  let changed = false;
  for (const key of Object.keys(rec.lastSent)) {
    const date = key.split('#')[2];
    if (!date || date < yesterday) { delete rec.lastSent[key]; changed = true; }
  }
  return changed;
}

/* ---------------- HTTP API ---------------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json', ...CORS }
  });

async function readAll(env) {
  const raw = await env.SUBS.get(KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
const writeAll = (env, all) => env.SUBS.put(KEY, JSON.stringify(all));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return json({ ok: true, now: new Date().toISOString() });
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }

    const subId = body.subId;
    if (!subId || typeof subId !== 'string' || subId.length > 64) {
      return json({ error: 'bad subId' }, 400);
    }

    const all = await readAll(env);
    const rec = all[subId] || { lastSent: {} };

    if (url.pathname === '/unsub') {
      delete all[subId];
      await writeAll(env, all);
      return json({ ok: true });
    }

    if (url.pathname === '/sub' || url.pathname === '/state') {
      if (body.subscription && body.subscription.endpoint) rec.subscription = body.subscription;

      // Only ever store the schedule and a single "quiet until" stamp.
      // No history, no name, nothing about whether past days were taken.
      if (typeof body.tz === 'string') rec.tz = body.tz;
      if (typeof body.lang === 'string') rec.lang = body.lang === 'he' ? 'he' : 'en';
      if (typeof body.enabled === 'boolean') rec.enabled = body.enabled;
      if (Array.isArray(body.items)) {
        rec.items = body.items.slice(0, 20).map((it) => ({
          id: String(it.id).slice(0, 32),
          time: /^\d{1,2}:\d{2}$/.test(it.time) ? it.time : '09:00',
          days: Array.isArray(it.days) ? it.days.filter((d) => d >= 0 && d <= 6) : [],
          // A one-off reminder carries a calendar date and ignores `days`.
          date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : null,
          repeatEvery: clampInt(it.repeatEvery, 0, 180),
          repeatCount: clampInt(it.repeatCount, 0, 10)
        }));
      }
      if (typeof body.rolloverHour === 'number') {
        rec.rolloverHour = Math.min(12, Math.max(0, body.rolloverHour));
      }
      if ('suppressUntil' in body) rec.suppressUntil = body.suppressUntil || null;

      rec.updatedAt = new Date().toISOString();
      rec.lastSent = rec.lastSent || {};

      all[subId] = rec;
      await writeAll(env, all);
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },

  /* Fires every minute. Kept deliberately small and forgiving: any
     single broken subscription must not stop the others. */
  async scheduled(event, env) {
    const now = new Date(event.scheduledTime || Date.now());
    const all = await readAll(env);
    let dirty = false;

    for (const subId of Object.keys(all)) {
      const rec = all[subId];
      try {
        if (!rec || !rec.enabled || !rec.subscription || !Array.isArray(rec.items)) continue;

        const tz = rec.tz || 'UTC';
        const rollover = typeof rec.rolloverHour === 'number' ? rec.rolloverHour : 4;
        // Day key uses the same rollover the app uses, so the wording
        // escalation lines up with what she sees on screen.
        const dayKey = localParts(tz, new Date(now.getTime() - rollover * 3600000)).dayKey;

        rec.lastSent = rec.lastSent || {};
        if (pruneSent(rec, tz, now)) dirty = true;

        // She already took it — every reminder, first or second, stays
        // quiet until the day flips.
        if (rec.suppressUntil && now < new Date(rec.suppressUntil)) continue;

        const due = dueFires(rec, now).filter((key) => !(key in rec.lastSent));
        if (!due.length) continue;

        // Two reminders landing on the same minute become one notification.
        const sentToday = Object.values(rec.lastSent).filter((v) => v === dayKey).length;
        const copy = (COPY[rec.lang] || COPY.en)[Math.min(sentToday, 2)];
        const result = await sendPush(rec.subscription, copy, env);

        if (result === 'gone') {
          delete all[subId];
          dirty = true;
          continue;
        }
        if (result === 'ok') {
          for (const key of due) rec.lastSent[key] = dayKey;
          dirty = true;
        }
      } catch (e) {
        console.log('tick failed for a subscriber', String(e));
      }
    }

    if (dirty) await writeAll(env, all);
  }
};

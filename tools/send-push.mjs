// Sends a one-off push to every registered device, bypassing the schedule.
// Useful for "did this actually reach the phone?" checks.
//
//   node tools/send-push.mjs "Title here" "Body here"
//
// Reads the live subscriptions out of Cloudflare KV via wrangler, and signs
// with the private key in secrets/vapid.json. Nothing is stored or changed.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const NS = 'c1aec739ca934432a57b277ca352d765';
const title = process.argv[2] || '🐘 Test';
const body  = process.argv[3] || '';

const enc = new TextEncoder();
const b64url = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const cat = (...ps) => { const t = ps.reduce((n, p) => n + p.length, 0); const o = new Uint8Array(t);
  let i = 0; for (const p of ps) { o.set(p, i); i += p.length; } return o; };

async function hkdf(ikm, salt, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

async function encryptPayload(text, p256dhB64, authB64) {
  const uaPublic = new Uint8Array(unb64url(p256dhB64));
  const authSecret = new Uint8Array(unb64url(authB64));
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(ecdh, authSecret,
    cat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(ikm, salt, cat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(ikm, salt, cat(enc.encode('Content-Encoding: nonce'),     new Uint8Array([0])), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes,
    cat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

async function vapidAuth(endpoint, vapid) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'https://ageldman-dotcom.github.io/elephant-reminder/' };
  const input = b64url(enc.encode(JSON.stringify(header))) + '.' +
                b64url(enc.encode(JSON.stringify(payload)));
  const j = vapid.privateJwk;
  const key = await crypto.subtle.importKey('jwk',
    { kty: j.kty, crv: j.crv, d: j.d, x: j.x, y: j.y },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input));
  return `vapid t=${input}.${b64url(sig)}, k=${vapid.publicKey}`;
}

const vapid = JSON.parse(readFileSync(fileURLToPath(new URL('../secrets/vapid.json', import.meta.url)), 'utf8'));
const raw = execSync(
  `npx --yes wrangler@latest kv key get subs --namespace-id ${NS} --remote`,
  { cwd: fileURLToPath(new URL('../worker', import.meta.url)), encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
const all = JSON.parse(raw.slice(raw.indexOf('{')));
const ids = Object.keys(all);

if (!ids.length) { console.log('No registered devices — nothing to send to.'); process.exit(0); }

for (const id of ids) {
  const sub = all[id].subscription;
  if (!sub) { console.log(`${id}: no subscription stored`); continue; }
  const payload = await encryptPayload(JSON.stringify({ title, body }), sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600', Urgency: 'high'
    },
    body: payload
  });
  console.log(`${id.slice(0, 10)}...  HTTP ${res.status} ${res.ok ? 'delivered to the push service' : await res.text()}`);
}

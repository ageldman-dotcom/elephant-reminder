// Generates a VAPID (Voluntary Application Server Identification) keypair for Web Push.
// Run once:  node tools/gen-vapid.mjs
//
// The PUBLIC key is baked into the app (safe, it ships to the browser).
// The PRIVATE key is stored as a Cloudflare Worker secret and must never be committed.
import { webcrypto as crypto } from 'node:crypto';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

// Uncompressed point (65 bytes, 0x04 || X || Y) — this is what applicationServerKey expects.
const rawPub = await crypto.subtle.exportKey('raw', pair.publicKey);
const jwkPriv = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log(JSON.stringify({
  publicKey: b64url(rawPub),
  privateJwk: { kty: jwkPriv.kty, crv: jwkPriv.crv, d: jwkPriv.d, x: jwkPriv.x, y: jwkPriv.y }
}, null, 2));

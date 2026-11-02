// Encrypts voters.json into ../voter-search-app/data.enc so that any one of the passwords in PASSWORDS.txt unlocks it.
// The passwords themselves are never written into the app: the data is encrypted once with a random key, and that key
// is stored once per password, each copy encrypted with a key derived from that password (PBKDF2-SHA256 + AES-GCM).
//
// Usage:  node app-build/encrypt.mjs   (creates PASSWORDS.txt with 10 new passwords if it doesn't exist)
// To revoke a password: delete its line from PASSWORDS.txt and run again. To add one: add a line "11: anything".
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..', 'voter-search-app');
const pwFile = join(here, 'PASSWORDS.txt');
const ITER = 310000;
const b64 = (u) => Buffer.from(u).toString('base64');
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

function newPassword() {  // 3 groups of 4 from an unambiguous alphabet (no 0/o/1/l/i), ~60 bits
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(12));
  const s = [...r].map((x) => abc[x % abc.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

if (!existsSync(pwFile)) {
  const lines = Array.from({ length: 10 }, (_, i) => `${i + 1}: ${newPassword()}`);
  writeFileSync(pwFile, '# Voter search app passwords - keep this file private, never upload it.\n' +
    '# Give one password per person. Delete a line and re-run encrypt.mjs to switch that password off.\n' +
    lines.join('\n') + '\n');
}
const passwords = readFileSync(pwFile, 'utf8').split('\n')
  .filter((l) => /^\s*\d+\s*:/.test(l)).map((l) => l.split(':').slice(1).join(':').trim()).filter(Boolean);
if (!passwords.length) throw new Error('no passwords in PASSWORDS.txt');

// Re-encrypt only when the voter data or the password list changed; otherwise phones that remembered the key would
// have to type their password again after a mere app update. (The state file holds only a hash, never a password.)
const stateFile = join(here, '.build-state');
const inputHash = createHash('sha256').update(readFileSync(join(here, 'voters.json'))).update(passwords.join('\n')).digest('hex');
const unchanged = existsSync(stateFile) && existsSync(join(app, 'data.enc')) && readFileSync(stateFile, 'utf8').trim() === inputHash;
if (unchanged && !process.argv.includes('--force')) {
  stamp(readFileSync(join(app, 'data.enc'), 'utf8'), 'data unchanged, not re-encrypted');
  process.exit(0);
}

// 1. encrypt the data once with a random data key
const dataKeyRaw = rand(32);
const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, 'AES-GCM', false, ['encrypt']);
const iv = rand(12);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey,
  readFileSync(join(here, 'voters.json'))));

// 2. one "slot" per password: the data key encrypted with that password's derived key. All slots share one salt so
//    the phone runs the slow PBKDF2 step once and then just tries each slot.
const salt = rand(16);
const slots = [];
for (const pw of passwords) {
  const siv = rand(12);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: siv }, kek, dataKeyRaw));
  slots.push({ iv: b64(siv), key: b64(wrapped) });
}
slots.sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128);  // slot order says nothing about the file order

const out = JSON.stringify({ v: 2, iter: ITER, salt: b64(salt), slots, iv: b64(iv), ct: b64(ct) });
writeFileSync(join(app, 'data.enc'), out);
writeFileSync(stateFile, inputHash + '\n');
stamp(out, `data.enc written: ${out.length} bytes, ${slots.length} passwords`);

// stamp the service worker so installed phones fetch the new files on their next online visit
function stamp(data, msg) {
  const h = createHash('sha256').update(data);
  for (const f of ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) h.update(readFileSync(join(app, f)));
  const version = h.digest('hex').slice(0, 12);
  const sw = join(app, 'sw.js');
  writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`));
  console.log(`${msg}; cache version ${version}`);
}

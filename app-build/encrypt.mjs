// Encrypts app-build/voters.json into voter-search-app/api/_voters.enc with the key in app-build/DATA_KEY.txt.
// The same key must be set as the DATA_KEY environment variable in Vercel; only the server can then read the data.
//
// Usage:  node app-build/encrypt.mjs    (creates DATA_KEY.txt the first time)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const keyFile = join(here, 'DATA_KEY.txt');
let created = false;
if (!existsSync(keyFile)) { writeFileSync(keyFile, randomBytes(32).toString('base64') + '\n'); created = true; }
const key = Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'base64');
if (key.length !== 32) throw new Error('DATA_KEY.txt must hold a base64 32-byte key');

const iv = randomBytes(12);
const c = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([c.update(readFileSync(join(here, 'voters.json'))), c.final()]);
const out = JSON.stringify({ v: 3, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') });
writeFileSync(join(here, '..', 'voter-search-app', 'api', '_voters.enc'), out);
console.log(`api/_voters.enc written (${out.length} bytes).` +
  (created ? ' New key created in app-build/DATA_KEY.txt: copy it into the DATA_KEY environment variable in Vercel.' : ''));

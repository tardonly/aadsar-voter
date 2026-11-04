// POST {adminPassword | token, action, ...}   (token = the admin token from logging into the app with the admin password)
//   action "list"                → {users: [{id, name, phone, created, lastSeen, retired, loggedIn, session*, logins, kicks,
//                                    perms, searchesToday, marked}], adminMarked}
//   action "add",   name, phone  → {user, password}   (password is shown to the admin once; only its hash is stored)
//   action "reset", id           → {user, password}   (new password for the same person; the old one stops working)
//   action "retire", id          → {ok}               (password stops working; the phone is logged out at once)
//   action "logout", id          → {ok}               (ends the person's current session; they can log in again)
//   action "phone", id, phone    → {user}             (add or change the person's WhatsApp number; "" removes it)
//   action "perms", id, perms    → {user}             (what the person may do: any of 'mark', 'ward', 'wardPdf', 'print')
//   action "clearMarks", status → {marks}            (removes every 'done' | 'coming' | 'absent' mark, or 'all' of them;
//                                                      the removed marks are kept as a backup first)
//   action "restoreMarks"       → {marks}            (puts back the marks removed by the last clearMarks)
// "list", "clearMarks" and "restoreMarks" also return marks: {done, coming, absent} (how many slips carry each mark),
// wards: [{ward, total, done, coming, absent}] (progress per ward) and backup: {n, at} | null.
// marked / adminMarked: how many slips carry a mark that person (or the admin) set.
// Phone numbers are stored as digits with the country code, e.g. 919876543210, ready for a wa.me link.
const crypto = require('crypto');
const { load } = require('./_search.js');
const { redis, MARKS, PERMS, permsOf, allMarks, today, pwHash, isAdminPassword, isAdminToken, newPassword, getUser, blocked, failed, send, route } = require('./_lib.js');

// "98765 43210", "098765-43210", "+91 98765 43210" → "919876543210"; '' when empty; null when not a valid number
function normPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && /^[6-9]/.test(d)) return '91' + d;
  if (d.length === 11 && d.startsWith('0')) return normPhone(d.slice(1));
  if (d.length === 12 && d.startsWith('91')) return normPhone(d.slice(2));
  if (!d.startsWith('91') && d.length >= 11 && d.length <= 15) return d;   // other countries, already with code
  return null;
}

// how many slips carry each mark, overall and per ward, and the backup the last "clear" left
async function markSummary(all) {
  all ||= await allMarks();
  const zero = () => Object.fromEntries(MARKS.map((m) => [m, 0]));
  const marks = zero(), perWard = {};
  for (const r of load().rows) {
    perWard[r.ward] ||= { ward: r.ward, total: 0, ...zero() };
    perWard[r.ward].total++;
  }
  for (const [key, { m }] of Object.entries(all)) {
    if (!MARKS.includes(m)) continue;
    marks[m]++;
    const w = perWard[key.split(':')[0]];
    if (w) w[m]++;
  }
  const bk = await redis('GET', 'marks:backup');
  let backup = null;
  try { if (bk) { const j = JSON.parse(bk); backup = { n: j.flat.length / 2, at: j.at }; } } catch (e) { /* ignore a broken backup */ }
  return { marks, wards: Object.values(perWard).sort((a, b) => a.ward - b.ward), backup };
}

async function freshPassword() {
  for (;;) {
    const pw = newPassword();
    if (!(await redis('GET', `pw:${pwHash(pw)}`))) return pw;
  }
}

module.exports = route(async (req, res, b) => {
  if (!process.env.ADMIN_PASSWORD) return send(res, 500, { error: 'server', detail: 'ADMIN_PASSWORD not set' });
  if (await blocked(req, 'admin')) return send(res, 429, { error: 'too_many' });
  if (!isAdminPassword(b.adminPassword) && !isAdminToken(b.token)) {
    await failed(req, 'admin');
    return send(res, 401, { error: 'wrong' });
  }
  const now = new Date().toISOString();

  if (b.action === 'list') {
    const ids = (await redis('SMEMBERS', 'users')) || [];
    const all = await allMarks(), marked = {};
    for (const { byId } of Object.values(all)) if (byId) marked[byId] = (marked[byId] || 0) + 1;
    const day = today();
    const searches = await Promise.all(ids.map((id) => redis('GET', `searches:${id}:${day}`)));
    const users = (await Promise.all(ids.map(getUser))).filter(Boolean)
      .map((u) => ({
        perms: permsOf(u), searchesToday: Number(searches[ids.indexOf(u.id)] || 0), marked: marked[u.id] || 0,
        id: u.id, name: u.name, phone: u.phone || '', created: u.created, lastSeen: u.lastSeen || null,
        retired: u.retired === '1', retiredAt: u.retiredAt || null,
        loggedIn: !!u.session && u.retired !== '1',
        sessionAt: u.sessionAt || null, sessionIp: u.sessionIp || null, sessionDevice: u.sessionDevice || null,
        logins: Number(u.logins || 0), kicks: Number(u.kicks || 0),
      }))
      .sort((x, y) => (x.created < y.created ? 1 : -1));
    return send(res, 200, { users, adminMarked: marked.admin || 0, ...(await markSummary(all)) });
  }

  if (b.action === 'clearMarks') {
    if (b.status !== 'all' && !MARKS.includes(b.status)) return send(res, 400, { error: 'status' });
    const flat = (await redis('HGETALL', 'marks')) || [];
    const gone = [];
    for (let i = 0; i < flat.length; i += 2) if (b.status === 'all' || String(flat[i + 1]).split('|')[0] === b.status) gone.push(flat[i], flat[i + 1]);
    if (gone.length) {
      await redis('SET', 'marks:backup', JSON.stringify({ at: now, flat: gone }));   // only the last clear can be undone
      const keys = gone.filter((x, i) => i % 2 === 0);
      for (let i = 0; i < keys.length; i += 500) await redis('HDEL', 'marks', ...keys.slice(i, i + 500));
    }
    return send(res, 200, await markSummary());
  }

  if (b.action === 'restoreMarks') {
    const bk = await redis('GET', 'marks:backup');
    if (!bk) return send(res, 404, { error: 'no_backup' });
    const { flat } = JSON.parse(bk);
    for (let i = 0; i < flat.length; i += 1000) await redis('HSET', 'marks', ...flat.slice(i, i + 1000));
    await redis('DEL', 'marks:backup');
    return send(res, 200, await markSummary());
  }

  if (b.action === 'add') {
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) return send(res, 400, { error: 'name' });
    const phone = normPhone(b.phone);
    if (phone === null) return send(res, 400, { error: 'phone' });
    const id = crypto.randomBytes(5).toString('hex');
    const password = await freshPassword(), hash = pwHash(password);
    await redis('HSET', `user:${id}`, 'name', name, 'phone', phone, 'created', now, 'retired', '0', 'hash', hash);
    await redis('SET', `pw:${hash}`, id);
    await redis('SADD', 'users', id);
    return send(res, 200, { user: { id, name, phone, created: now, retired: false }, password });
  }

  const user = b.id ? await getUser(String(b.id)) : null;
  if (!user) return send(res, 404, { error: 'not_found' });

  if (b.action === 'reset') {
    const password = await freshPassword(), hash = pwHash(password);
    if (user.hash) await redis('DEL', `pw:${user.hash}`);
    await redis('HSET', `user:${user.id}`, 'hash', hash, 'retired', '0', 'session', '');
    await redis('SET', `pw:${hash}`, user.id);
    return send(res, 200, { user: { id: user.id, name: user.name, phone: user.phone || '' }, password });
  }

  if (b.action === 'perms') {
    const perms = PERMS.filter((p) => Array.isArray(b.perms) && b.perms.includes(p));
    await redis('HSET', `user:${user.id}`, 'perms', perms.join(','));
    return send(res, 200, { user: { id: user.id, name: user.name, perms } });
  }

  if (b.action === 'phone') {
    const phone = normPhone(b.phone);
    if (phone === null) return send(res, 400, { error: 'phone' });
    await redis('HSET', `user:${user.id}`, 'phone', phone);
    return send(res, 200, { user: { id: user.id, name: user.name, phone } });
  }

  if (b.action === 'retire') {
    await redis('HSET', `user:${user.id}`, 'retired', '1', 'retiredAt', now, 'session', '');
    return send(res, 200, { ok: true });
  }

  if (b.action === 'logout') {
    await redis('HSET', `user:${user.id}`, 'session', '');
    return send(res, 200, { ok: true });
  }

  send(res, 400, { error: 'action' });
});

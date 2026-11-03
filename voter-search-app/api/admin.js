// POST {adminPassword | token, action, ...}   (token = the admin token from logging into the app with the admin password)
//   action "list"                → {users: [{id, name, phone, created, lastSeen, retired, loggedIn, session*, logins, kicks, wardPdfs}]}
//   action "add",   name, phone  → {user, password}   (password is shown to the admin once; only its hash is stored)
//   action "reset", id           → {user, password}   (new password for the same person; the old one stops working)
//   action "retire", id          → {ok}               (password stops working; the phone is logged out at once)
//   action "logout", id          → {ok}               (ends the person's current session; they can log in again)
//   action "phone", id, phone    → {user}             (add or change the person's WhatsApp number; "" removes it)
// Phone numbers are stored as digits with the country code, e.g. 919876543210, ready for a wa.me link.
const crypto = require('crypto');
const { redis, pwHash, isAdminPassword, isAdminToken, newPassword, getUser, blocked, failed, send, route } = require('./_lib.js');

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
    const users = (await Promise.all(ids.map(getUser))).filter(Boolean)
      .map((u) => ({
        id: u.id, name: u.name, phone: u.phone || '', created: u.created, lastSeen: u.lastSeen || null,
        retired: u.retired === '1', retiredAt: u.retiredAt || null,
        loggedIn: !!u.session && u.retired !== '1',
        sessionAt: u.sessionAt || null, sessionIp: u.sessionIp || null, sessionDevice: u.sessionDevice || null,
        logins: Number(u.logins || 0), kicks: Number(u.kicks || 0), wardPdfs: Number(u.wardPdfs || 0),
      }))
      .sort((x, y) => (x.created < y.created ? 1 : -1));
    return send(res, 200, { users });
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

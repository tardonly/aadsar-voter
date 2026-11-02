// POST {adminPassword | token, action, ...}   (token = the admin token from logging into the app with the admin password)
//   action "list"                → {users: [{id, name, created, lastSeen, retired}]}
//   action "add",   name         → {user, password}   (password is shown to the admin once; only its hash is stored)
//   action "reset", id           → {user, password}   (new password for the same person; the old one stops working)
//   action "retire", id          → {ok}               (password stops working; phones lock on their next online check)
const crypto = require('crypto');
const { redis, pwHash, isAdminPassword, isAdminToken, newPassword, getUser, blocked, failed, send, route } = require('./_lib.js');

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
      .map(({ id, name, created, lastSeen, retired, retiredAt }) => ({ id, name, created, lastSeen: lastSeen || null, retired: retired === '1', retiredAt: retiredAt || null }))
      .sort((x, y) => (x.created < y.created ? 1 : -1));
    return send(res, 200, { users });
  }

  if (b.action === 'add') {
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) return send(res, 400, { error: 'name' });
    const id = crypto.randomBytes(5).toString('hex');
    const password = await freshPassword(), hash = pwHash(password);
    await redis('HSET', `user:${id}`, 'name', name, 'created', now, 'retired', '0', 'hash', hash);
    await redis('SET', `pw:${hash}`, id);
    await redis('SADD', 'users', id);
    return send(res, 200, { user: { id, name, created: now, retired: false }, password });
  }

  const user = b.id ? await getUser(String(b.id)) : null;
  if (!user) return send(res, 404, { error: 'not_found' });

  if (b.action === 'reset') {
    const password = await freshPassword(), hash = pwHash(password);
    if (user.hash) await redis('DEL', `pw:${user.hash}`);
    await redis('HSET', `user:${user.id}`, 'hash', hash, 'retired', '0');
    await redis('SET', `pw:${hash}`, user.id);
    return send(res, 200, { user: { id: user.id, name: user.name }, password });
  }

  if (b.action === 'retire') {
    await redis('HSET', `user:${user.id}`, 'retired', '1', 'retiredAt', now);
    return send(res, 200, { ok: true });
  }

  send(res, 400, { error: 'action' });
});

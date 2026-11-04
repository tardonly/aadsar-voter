// POST {password} → {name, token, admin, perms} for an active password or the admin password.
// Each login starts a new session; a phone still using an older session of the same password is logged out
// on its next request. The token is sent with every search; an admin token also opens admin.html.
const { redis, PERMS, permsOf, pwHash, newSession, makeToken, isAdminPassword, adminToken, getUser, clientIp, deviceName,
  blocked, failed, send, route } = require('./_lib.js');

const STILL_IN_USE_MS = 30 * 60 * 1000;   // previous phone used within 30 min → counts as "two phones at once"

module.exports = route(async (req, res, { password }) => {
  if (await blocked(req, 'unlock')) return send(res, 429, { error: 'too_many' });
  if (isAdminPassword(password)) return send(res, 200, { name: 'एडमिन', token: adminToken(), admin: true, perms: PERMS });
  const id = password ? await redis('GET', `pw:${pwHash(password)}`) : null;
  const user = id ? await getUser(id) : null;
  if (!user) {
    await failed(req, 'unlock');
    return send(res, 401, { error: 'wrong' });
  }
  if (user.retired === '1') return send(res, 403, { error: 'retired' });

  const now = new Date(), sid = newSession();
  const stillInUse = !!user.session && !!user.lastSeen && now - Date.parse(user.lastSeen) < STILL_IN_USE_MS;
  await redis('HSET', `user:${id}`, 'session', sid, 'sessionAt', now.toISOString(), 'sessionIp', clientIp(req),
    'sessionDevice', deviceName(req), 'lastSeen', now.toISOString());
  await redis('HINCRBY', `user:${id}`, 'logins', 1);
  if (stillInUse) await redis('HINCRBY', `user:${id}`, 'kicks', 1);
  send(res, 200, { name: user.name, token: makeToken(id, sid), admin: false, perms: permsOf(user) });
});

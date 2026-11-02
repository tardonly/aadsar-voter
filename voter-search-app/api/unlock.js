// POST {password} → {name, token, admin} for an active password or the admin password.
// The token is sent with every search; an admin token also opens admin.html without logging in again.
const { redis, pwHash, makeToken, isAdminPassword, adminToken, getUser, blocked, failed, send, route } = require('./_lib.js');

module.exports = route(async (req, res, { password }) => {
  if (await blocked(req, 'unlock')) return send(res, 429, { error: 'too_many' });
  if (isAdminPassword(password)) return send(res, 200, { name: 'एडमिन', token: adminToken(), admin: true });
  const id = password ? await redis('GET', `pw:${pwHash(password)}`) : null;
  const user = id ? await getUser(id) : null;
  if (!user) {
    await failed(req, 'unlock');
    return send(res, 401, { error: 'wrong' });
  }
  if (user.retired === '1') return send(res, 403, { error: 'retired' });
  await redis('HSET', `user:${id}`, 'lastSeen', new Date().toISOString());
  send(res, 200, { name: user.name, token: makeToken(id), admin: false });
});

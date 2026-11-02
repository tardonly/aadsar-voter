// POST {token} → {active, name, admin, reason}. The app calls this when it opens.
// reason when not active: 'login' (unknown/old token) | 'retired' | 'logged_out' | 'other_device'
const { redis, whoIs, send, route } = require('./_lib.js');

module.exports = route(async (req, res, { token }) => {
  const user = await whoIs(token);
  if (!user) return send(res, 200, { active: false, reason: 'login' });
  if (user.status !== 'ok') return send(res, 200, { active: false, reason: user.status });
  if (!user.admin) await redis('HSET', `user:${user.id}`, 'lastSeen', new Date().toISOString());
  send(res, 200, { active: true, name: user.name, admin: !!user.admin });
});

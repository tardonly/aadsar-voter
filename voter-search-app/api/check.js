// POST {token} → {active, name, admin}. The app calls this when it opens; a retired password gets active:false.
const { redis, whoIs, send, route } = require('./_lib.js');

module.exports = route(async (req, res, { token }) => {
  const user = await whoIs(token);
  const active = !!user && user.retired !== '1';
  if (active && !user.admin) await redis('HSET', `user:${user.id}`, 'lastSeen', new Date().toISOString());
  send(res, 200, { active, name: active ? user.name : null, admin: !!(active && user.admin) });
});

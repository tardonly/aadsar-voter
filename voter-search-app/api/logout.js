// POST {token} → {ok}. Ends this phone's session, so logging in again later isn't counted as a second phone.
const { redis, whoIs, send, route } = require('./_lib.js');

module.exports = route(async (req, res, { token }) => {
  const user = await whoIs(token);
  if (user && !user.admin && user.status === 'ok') await redis('HSET', `user:${user.id}`, 'session', '');
  send(res, 200, { ok: true });
});

// POST {token, ward, box, status} → {ok, status}. Admin only (the admin token from logging into the app).
// status: 'done' (green) | 'coming' (yellow) | 'absent' (red) | '' (remove the mark). Everyone sees the mark on the slip.
const { redis, isAdminToken, MARKS, markKey, send, route } = require('./_lib.js');
const { load } = require('./_search.js');

module.exports = route(async (req, res, b) => {
  if (!isAdminToken(b.token)) return send(res, 403, { error: 'admin' });
  const key = markKey(b);
  if (!load().rows.some((r) => markKey(r) === key)) return send(res, 404, { error: 'not_found' });
  const status = String(b.status || '');
  if (status && !MARKS.includes(status)) return send(res, 400, { error: 'status' });
  if (status) await redis('HSET', 'marks', key, `${status}|${new Date().toISOString()}`);
  else await redis('HDEL', 'marks', key);
  send(res, 200, { ok: true, status });
});

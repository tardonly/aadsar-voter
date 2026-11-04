// POST {token, ward, box, status} → {ok, status, by, at}. For the admin and people allowed 'mark'.
// status: 'done' (green) | 'coming' (yellow) | 'absent' (red) | '' (remove the mark). Everyone sees the mark on the slip,
// with who set it and when.
const { redis, whoIs, MARKS, markKey, send, route } = require('./_lib.js');
const { load } = require('./_search.js');

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });
  if (!user.perms.includes('mark')) return send(res, 403, { error: 'no_mark' });
  const key = markKey(b);
  if (!load().rows.some((r) => markKey(r) === key)) return send(res, 404, { error: 'not_found' });
  const status = String(b.status || '');
  if (status && !MARKS.includes(status)) return send(res, 400, { error: 'status' });
  const at = new Date().toISOString(), by = String(user.name || '').replace(/\|/g, '/');
  if (status) await redis('HSET', 'marks', key, `${status}|${at}|${user.id}|${by}`);
  else await redis('HDEL', 'marks', key);
  send(res, 200, { ok: true, status, by: status ? by : '', at: status ? at : '' });
});

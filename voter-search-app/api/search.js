// POST {token, name, rel, ward, offset} → {total, offset, results: [...up to 50 voters, each with its status mark], wards}
// Every search checks that the password behind the token is still active and that this phone holds its newest
// session, so retiring or logging in on another phone takes effect at once.
const { redis, whoIs, markKey, marksFor, send, route } = require('./_lib.js');
const { load, search, publicFields } = require('./_search.js');

const PAGE = 50, MAX_OFFSET = 200, PER_MINUTE = 120;

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });   // retired, or opened on another phone

  const minuteKey = `rate:${user.id}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis('INCR', minuteKey);
  if (n === 1) await redis('EXPIRE', minuteKey, 120);
  if (n > PER_MINUTE) return send(res, 429, { error: 'slow_down' });

  const hits = search(b);
  const offset = Math.min(Math.max(0, parseInt(b.offset, 10) || 0), MAX_OFFSET);
  const results = hits.slice(offset, offset + PAGE).map(publicFields);
  const marks = await marksFor(results.map(markKey));
  results.forEach((r, i) => { r.mark = marks[i]; });
  send(res, 200, { total: hits.length, offset, page: PAGE, results, wards: load().wards });
});

// POST {token, name, rel, ward, offset} → {total, offset, limit, results: [...up to 10 voters, each with its status mark], wards}
// A ward with no name lists the whole ward in box order; a name search pages through its best 250 matches.
// Every search checks that the password behind the token is still active and that this phone holds its newest
// session, so retiring or logging in on another phone takes effect at once.
const { redis, whoIs, markKey, marksFor, send, route } = require('./_lib.js');
const { load, search, publicFields } = require('./_search.js');

const PAGE = 10, MAX_NAMED = 250, PER_MINUTE = 120;

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });   // retired, or opened on another phone

  const minuteKey = `rate:${user.id}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis('INCR', minuteKey);
  if (n === 1) await redis('EXPIRE', minuteKey, 120);
  if (n > PER_MINUTE) return send(res, 429, { error: 'slow_down' });

  const hits = search(b);
  const named = String(b.name || '').trim() || String(b.rel || '').trim();
  const limit = named ? MAX_NAMED : hits.length;
  const offset = Math.min(Math.max(0, parseInt(b.offset, 10) || 0), Math.max(0, limit - 1));
  const results = hits.slice(offset, Math.min(offset + PAGE, limit)).map(publicFields);
  const marks = await marksFor(results.map(markKey));
  results.forEach((r, i) => { r.mark = marks[i]; });
  send(res, 200, { total: hits.length, offset, page: PAGE, limit, results, wards: load().wards });
});

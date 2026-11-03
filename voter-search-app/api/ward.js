// POST {token, ward} → {ward, kendra, voters: [every voter of the ward, by box number]} for the whole-ward slip PDF.
// Any active login may download. Each download is counted on the person (shown in the admin list), and a person
// gets at most PER_DAY ward downloads a day, so one password can't keep copying the list.
const { redis, whoIs, send, route } = require('./_lib.js');
const { load, publicFields } = require('./_search.js');

const PER_DAY = 25;

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });
  const ward = parseInt(b.ward, 10);
  const voters = load().rows.filter((r) => r.ward === ward).sort((x, y) => x.box - y.box);
  if (!voters.length) return send(res, 404, { error: 'not_found' });

  if (!user.admin) {
    const dayKey = `wardpdf:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const n = await redis('INCR', dayKey);
    if (n === 1) await redis('EXPIRE', dayKey, 2 * 86400);
    if (n > PER_DAY) return send(res, 429, { error: 'ward_limit' });
    await redis('HINCRBY', `user:${user.id}`, 'wardPdfs', 1);
  }
  send(res, 200, { ward, kendra: voters[0].kendra, voters: voters.map(publicFields) });
});

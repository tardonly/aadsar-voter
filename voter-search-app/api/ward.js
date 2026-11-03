// POST {token, ward} → {ward, kendra, voters: [every voter of the ward, by box number]} for the whole-ward slip PDF.
// Admin only, so the whole list can't be copied with a shared password.
const { whoIs, send, route } = require('./_lib.js');
const { load, publicFields } = require('./_search.js');

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });
  if (!user.admin) return send(res, 403, { error: 'admin' });
  const ward = parseInt(b.ward, 10);
  const voters = load().rows.filter((r) => r.ward === ward).sort((x, y) => x.box - y.box);
  if (!voters.length) return send(res, 404, { error: 'not_found' });
  send(res, 200, { ward, kendra: voters[0].kendra, voters: voters.map(publicFields) });
});

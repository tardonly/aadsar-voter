// POST {token, keys: ["<ward>:<box>", …]} → {marks: {"<ward>:<box>": status}}. The app asks this now and then to
// refresh the marks on the slips it is showing, so a mark the admin sets reaches every phone without a new search.
const { whoIs, marksFor, send, route } = require('./_lib.js');

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });
  const keys = (Array.isArray(b.keys) ? b.keys : []).map(String).filter((k) => /^\d{1,2}:\d{1,4}$/.test(k)).slice(0, 250);
  const vals = await marksFor(keys);
  send(res, 200, { marks: Object.fromEntries(keys.map((k, i) => [k, vals[i]])) });
});

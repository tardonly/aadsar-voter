// POST {token, name, rel, ward, mark, offset, after, counts} → {total, more, results: [...up to 10 voters, each with its
//   status mark], wards, perms, counts?}
//   POST {token, family: "<ward>:<box>"} → {total, results: everyone at that voter's house number in that ward}
// mark filters by status mark: 'none' (no mark yet) | 'done' | 'coming' | 'absent'.
// With no name:
//   - a ward and no mark filter (or 'none') lists the whole ward in box order: only for people allowed 'ward';
//   - mark 'done' | 'coming' | 'absent' lists every voter with that mark, in the ward or (no ward) in all wards:
//     for people allowed 'lists' (or 'ward', within a ward).
// These lists page with after = ward * 10000 + box of the last slip shown, so marking slips while going through a
// filtered list doesn't skip anyone. A name search pages through its best 250 matches.
// counts: 1 adds counts: {done, coming, absent, none} for the chosen ward (or all wards), for people allowed lists/ward;
// with no name, ward or mark it returns only the counts.
// Every search checks that the password behind the token is still active and that this phone holds its newest
// session, so retiring or logging in on another phone takes effect at once.
const { redis, whoIs, MARKS, markKey, marksFor, allMarks, today, send, route } = require('./_lib.js');
const { load, search, family, publicFields } = require('./_search.js');

const PAGE = 10, MAX_NAMED = 250, MAX_FAMILY = 60, PER_MINUTE = 120;

async function withMarks(list) {
  const results = list.map(publicFields);
  const marks = await marksFor(results.map(markKey));
  results.forEach((r, i) => { r.mark = marks[i].m; r.markBy = marks[i].by; r.markAt = marks[i].at; });
  return results;
}

module.exports = route(async (req, res, b) => {
  const user = await whoIs(b.token);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.status !== 'ok') return send(res, 403, { error: user.status });   // retired, or opened on another phone

  const minuteKey = `rate:${user.id}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis('INCR', minuteKey);
  if (n === 1) await redis('EXPIRE', minuteKey, 120);
  if (n > PER_MINUTE) return send(res, 429, { error: 'slow_down' });
  if (!user.admin) {   // searches per person per day, shown on the admin page
    const dayKey = `searches:${user.id}:${today()}`;
    if (await redis('INCR', dayKey) === 1) await redis('EXPIRE', dayKey, 3 * 86400);
  }

  if (b.family) {
    const results = await withMarks(family(b.family).slice(0, MAX_FAMILY));
    return send(res, 200, { total: results.length, results, perms: user.perms });
  }

  const named = String(b.name || '').trim() || String(b.rel || '').trim();
  const ward = parseInt(b.ward, 10) || 0;
  const filter = String(b.mark || '');
  const statusList = MARKS.includes(filter);
  const can = (p) => user.perms.includes(p);
  const scope = () => (ward ? load().rows.filter((r) => r.ward === ward) : load().rows);
  let marks = null;
  async function countMarks() {   // how many voters in the ward (or all wards) carry each mark
    if (!b.counts || !(can('lists') || (ward && can('ward')))) return undefined;
    marks ||= await allMarks();
    const rows = scope(), c = Object.fromEntries(MARKS.map((m) => [m, 0]));
    for (const r of rows) { const m = (marks[markKey(r)] || {}).m; if (m in c) c[m]++; }
    c.none = rows.length - MARKS.reduce((n, m) => n + c[m], 0);
    return c;
  }
  if (!named && !ward && !filter) return send(res, 200, { total: 0, more: false, results: [], perms: user.perms, counts: await countMarks() });
  if (!named) {
    if (statusList && !can('lists') && !(ward && can('ward'))) return send(res, 403, { error: 'no_lists' });
    if (!statusList && !(ward && can('ward'))) return send(res, 403, { error: 'no_ward' });
  }
  let hits = named || ward ? search(b) : scope().slice().sort((x, y) => x.ward - y.ward || x.box - y.box);
  if (filter === 'none' || statusList) {
    marks = await allMarks();
    hits = hits.filter((r) => ((marks[markKey(r)] || {}).m || 'none') === filter);
  }
  const total = hits.length;
  let page, more;
  if (named) {
    const limit = Math.min(total, MAX_NAMED);
    const offset = Math.min(Math.max(0, parseInt(b.offset, 10) || 0), limit);
    page = hits.slice(offset, Math.min(offset + PAGE, limit));
    more = offset + PAGE < limit;
  } else {
    const after = parseInt(b.after, 10) || 0;
    const rest = after ? hits.filter((r) => r.ward * 10000 + r.box > after) : hits;
    page = rest.slice(0, PAGE);
    more = rest.length > PAGE;
  }
  send(res, 200, { total, more, results: await withMarks(page), wards: load().wards, perms: user.perms, counts: await countMarks() });
});

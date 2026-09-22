/**
 * A one-line answer to "is the database actually connected?"
 *
 *   GET public → { store: "redis" | "file", ok: true/false, ... }
 *
 * WHY THIS EXISTS: with no database attached, this site still renders
 * perfectly — reads fall back to the starter content in data/seed.json. The
 * only symptom is that every save fails. That is a horrible thing to diagnose
 * from the outside, and it cost us an afternoon once already.
 *
 * So: open /api/health in a browser and it tells you plainly.
 *
 * It is PUBLIC, and safe to be. It reports which kind of store is in use and
 * whether a read worked — never a URL, never a token, never any of the
 * content. Nothing here is worth hiding, and a health check you have to log in
 * for is useless exactly when you need it.
 *
 * It does not write. Writing from an endpoint anybody can call would be a way
 * to make the site busy for free. To prove writing works, save something in
 * edit mode — that is the real test, and it now reports its own errors
 * properly.
 */

import { get, usingRedis } from '../lib/kv.js';
import { ok, methodNotAllowed, withErrors } from '../lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method?.toUpperCase() !== 'GET') return methodNotAllowed(res, ['GET']);

  /* Deployed on Vercel, or running on somebody's laptop? The file store is
     correct locally and impossible on Vercel, so the same answer means
     different things in the two places. */
  const deployed = process.env.VERCEL_ENV === 'production'
    || process.env.VERCEL_ENV === 'preview';

  let readable = false;
  let readError = null;
  try {
    /* Any key will do — we only care that the round trip works. A key that has
       never been written comes back null, which is a perfectly good answer. */
    await get('settings');
    readable = true;
  } catch (error) {
    readError = error.message;
  }

  const store = usingRedis ? 'redis' : 'file';
  const healthy = usingRedis ? readable : !deployed;

  return ok(res, {
    ok: healthy,
    store,
    readable,
    ...(readError ? { readError } : {}),
    environment: process.env.VERCEL_ENV ?? 'local',
    note: healthy
      ? (usingRedis
          ? 'Connected to Redis. Saving will work.'
          : 'Local file store — correct on your own machine.')
      : (deployed && !usingRedis
          ? 'NO DATABASE. The site will render, but nothing can be saved. '
            + 'In Vercel: Storage → Create Database → Upstash for Redis, connect it '
            + 'to this project, then REDEPLOY — environment variables only apply to '
            + 'the next build.'
          : 'The database is configured but could not be read. Check the Upstash '
            + 'dashboard, and that the integration is still connected.'),
  });
});

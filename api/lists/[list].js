/**
 * Three lists, one function: the weekly timetable, the previous-events poster
 * wall, and the About page timeline.
 *
 *   /api/lists/weekly     every session that happens each week
 *   /api/lists/archive    old event posters for the "Previous events" collage
 *   /api/lists/timeline   past, present and future, on the About page
 *
 * Each behaves exactly like /api/events: GET is public, and adding, editing,
 * reordering and deleting all need a live edit-mode session (lib/collection.js).
 *
 * WHY ONE FILE AND NOT THREE. Vercel's free plan allows twelve functions per
 * site, and every file in /api is one. The `[list]` in this file's name means
 * "whatever comes after /api/lists/", so three lists cost one function.
 *
 * Images are ALWAYS pasted URLs (Cloudinary). There is no upload anywhere.
 */

import { collectionRoute } from '../../lib/collection.js';
import { clean, cleanMultiline, cleanUrl, notFound, withErrors } from '../../lib/http.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PHASES = ['Past', 'Present', 'Future'];

const order = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const ROUTES = {
  /*
    THE WEEK. One record per session. The day has to be one of the seven
    (anything else becomes Monday) because the Events page lays the sessions
    out in a Monday-to-Sunday grid and highlights today.
  */
  weekly: collectionRoute({
    key: 'weekly',
    idPrefix: 'weekly',
    sanitize: (item) => ({
      id: item.id,
      title: clean(item.title, 120),
      day: DAYS.includes(item.day) ? item.day : 'Monday',
      time: clean(item.time, 60),            // free text: "7.00 – 8.30pm", "After Maghrib"
      who: clean(item.who, 80),              // "Brothers 11–16", "Everyone"
      location: clean(item.location, 140),
      description: cleanMultiline(item.description, 600),
      imageUrl: cleanUrl(item.imageUrl),
      imageAlt: clean(item.imageAlt, 200),
      order: order(item.order),
      published: item.published !== false,
    }),
  }),

  /*
    THE POSTER WALL. Only the poster is needed. Everything else is optional,
    and a poster with nothing else added is shown but cannot be clicked —
    there would be nothing to open.
  */
  archive: collectionRoute({
    key: 'archive',
    idPrefix: 'poster',
    sanitize: (item) => ({
      id: item.id,
      posterUrl: cleanUrl(item.posterUrl),
      alt: clean(item.alt, 200),
      title: clean(item.title, 140),
      date: clean(item.date, 60),            // free text: "Ramadan 2023", "March 2022"
      details: cleanMultiline(item.details, 3000),
      /* Any more pictures or films from the night, one URL per line. */
      media: (Array.isArray(item.media) ? item.media : String(item.media ?? '').split('\n'))
        .map(cleanUrl)
        .filter(Boolean)
        .slice(0, 30),
      order: order(item.order),
      published: item.published !== false,
    }),
  }),

  /* THE TIMELINE. Each entry belongs to the past, the present or the future. */
  timeline: collectionRoute({
    key: 'timeline',
    idPrefix: 'moment',
    sanitize: (item) => ({
      id: item.id,
      phase: PHASES.includes(item.phase) ? item.phase : 'Past',
      when: clean(item.when, 60),            // "2016", "Today", "By 2028"
      title: clean(item.title, 140),
      text: cleanMultiline(item.text, 1200),
      imageUrl: cleanUrl(item.imageUrl),
      imageAlt: clean(item.imageAlt, 200),
      order: order(item.order),
      published: item.published !== false,
    }),
  }),
};

export default withErrors(async (req, res) => {
  const name = req.query?.list
    ?? new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean).pop();
  const route = ROUTES[name];
  if (!route) return notFound(res, `There is no list called "${name}".`);
  return route(req, res);
});

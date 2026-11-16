/**
 * Events — the collection the whole site is built around.
 *
 *   GET     public → { items: [...] }
 *   POST    admin  → add one event
 *   PUT     admin  → update one by id, or replace the whole list
 *   DELETE  admin  → remove the one at ?id=
 *
 * All four are handled by lib/collection.js; the only thing this file supplies
 * is `sanitize`, which decides the shape of one event and cleans every field
 * before it is stored. Nothing reaches the database without passing through it.
 *
 * NOTHING HERE RECORDS WHETHER AN EVENT HAS HAPPENED. There is no "past" flag
 * and no ordering field, because both would be something to remember to change.
 * The date is the only fact stored; upcoming and past are worked out from it
 * every time a page is drawn. An event moves itself.
 *
 * The menu overlay counts these to show "Events 3", so this route is what makes
 * that number real rather than typed in by hand.
 */

import { collectionRoute } from '../lib/collection.js';
import { clean, cleanMultiline, cleanUrl, slugify } from '../lib/http.js';

/*
  HOW OFTEN an event happens — the tabs at the top of the event form.
    one-off    happens once, on its date
    weekly     happens every week on `day`; has no date. These are what fill
               the weekly timetable (homepage, Events, What We Do).
    recurring  comes round again ("Once a year", "Every Ramadan"); `repeats`
               says how often and `date` is the next one.
*/
const FREQUENCIES = ['one-off', 'weekly', 'recurring'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Accepts YYYY-MM-DD and nothing else; anything odd is stored as empty. */
function cleanDate(value) {
  const date = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  /* A real calendar date too: 2026-27-09 (day and month swapped) is refused. */
  const [y, m, d] = date.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? date : '';
}

export default collectionRoute({
  key: 'events',
  idPrefix: 'event',

  sanitize(event, existing) {
    const title = clean(event.title, 140);

    /*
      The slug is what appears in the address: /events/summer-camp. It is made
      from the title unless one was typed in, and it has to be unique, because
      two events sharing a slug would make one of them unreachable.
    */
    let slug = slugify(event.slug || title, event.id);
    const clashes = (candidate) =>
      existing.some((other) => other.id !== event.id && other.slug === candidate);
    for (let n = 2; clashes(slug); n += 1) slug = `${slugify(event.slug || title, event.id)}-${n}`;

    return {
      id: event.id,
      slug,
      title,

      /*
        The small blue label on the card. FREE TEXT, deliberately — a fixed
        list would be out of date within a month, and adding to it would mean
        a code change. The edit form offers the ones already in use as
        suggestions, so in practice they stay consistent without being locked.
      */
      category: clean(event.category, 60),

      frequency: FREQUENCIES.includes(event.frequency) ? event.frequency : 'one-off',
      day: DAYS.includes(event.day) ? event.day : '',            // weekly only
      repeats: clean(event.repeats, 60),                         // recurring only
      who: clean(event.who, 80),                                 // "Ages 11–16", "Brothers"
      /* Order within the same day, for weekly ones. Lowest first. */
      order: Number.isFinite(Number(event.order)) ? Number(event.order) : 0,

      /* A weekly event has no date — it is every week. */
      date: event.frequency === 'weekly' ? '' : cleanDate(event.date),
      time: clean(event.time, 40),          // free text: "6–8pm", "after Maghrib"
      location: clean(event.location, 160),

      /* One or two lines, shown on the card and under the headline. */
      summary: cleanMultiline(event.summary, 600),
      /* The full write-up on the event's own page. Blank lines make paragraphs. */
      body: cleanMultiline(event.body, 6000),

      /*
        Two pictures, doing two different jobs:
          imageUrl   the landscape one — the card and the page's hero
          posterUrl  the square graphic you would send to somebody on WhatsApp,
                     shown beside the sign-up button rather than as the hero
      */
      imageUrl: cleanUrl(event.imageUrl),
      posterUrl: cleanUrl(event.posterUrl),
      /* What each picture shows, in words. Read out to anyone using a screen
         reader, and shown if the picture fails to load. */
      imageAlt: clean(event.imageAlt, 200),
      posterAlt: clean(event.posterAlt, 200),

      signUpUrl: cleanUrl(event.signUpUrl),  // optional; no button without one

      /* Pins this one to the top of the homepage. With none set, or none of
         the flagged ones still upcoming, the soonest event is used instead. */
      featured: event.featured === true,

      published: event.published !== false,  // new events are visible by default
    };
  },
});

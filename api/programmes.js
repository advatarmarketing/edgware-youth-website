/**
 * Programmes — the things Edgware Youth actually runs, week in week out.
 *
 *   GET     public → { items: [...] }
 *   POST    admin  → add one
 *   PUT     admin  → update one by id, or replace the whole list (reordering)
 *   DELETE  admin  → remove the one at ?id=
 *
 * These are the rows in the table on /what-we-do. A row is deliberately small:
 * a name on the left and a type on the right, with a picture that appears
 * beside the cursor when you run over it. There is no separate page per
 * programme — if one needs its own page it is an event, not a programme.
 *
 * All four verbs are handled by lib/collection.js; the only thing this file
 * decides is the shape of one record.
 */

import { collectionRoute } from '../lib/collection.js';
import { clean, cleanMultiline, cleanUrl, slugify } from '../lib/http.js';

export default collectionRoute({
  key: 'programmes',
  idPrefix: 'programme',

  sanitize(programme, existing) {
    const name = clean(programme.name, 140);

    /*
      The slug is not an address here — there is no page per programme — it is
      the row's anchor, so /what-we-do#weekly-halaqa scrolls straight to it. It
      still has to be unique, or two rows would answer to the same link.
    */
    const base = () => slugify(programme.slug || name, programme.id);
    let slug = base();
    const clashes = (candidate) =>
      existing.some((other) => other.id !== programme.id && other.slug === candidate);
    for (let n = 2; clashes(slug); n += 1) slug = `${base()}-${n}`;

    return {
      id: programme.id,
      slug,
      name,
      /* The right-hand column, in blue — "Weekly", "Monthly", "Annual".
         Free text, the same as an event's category. */
      type: clean(programme.type, 60),
      /* Stored for the stacked cards on a phone, where there is room to read
         it. The desktop row is two columns and shows only the name and the
         type — see the table in app.js. */
      description: cleanMultiline(programme.description, 400),
      /* The picture that follows the cursor along the row. Always a pasted
         URL — there are no uploads anywhere on this site. */
      imageUrl: cleanUrl(programme.imageUrl),
      /* What the picture shows, in words — read out to anyone using a screen
         reader, and shown if the picture ever fails to load. Every image URL
         on this site has one of these beside it. */
      imageAlt: clean(programme.imageAlt, 200),
      /* Lowest first. The manager's up/down buttons rewrite these. */
      order: Number.isFinite(Number(programme.order)) ? Number(programme.order) : 0,
      published: programme.published !== false,
    };
  },
});

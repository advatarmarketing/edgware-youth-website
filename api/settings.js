/**
 * Site-wide settings: the contact email, the footer's social links, and every
 * piece of media that isn't attached to a single event.
 *
 * Unlike events, there is only ever ONE of these, so it is a single object
 * rather than a list:
 *
 *   GET  public → { settings }
 *   PUT  admin  → merge changes in
 *
 * EVERY FIELD STARTS EMPTY, and empty is a designed state everywhere it is
 * used — an unset social link isn't rendered, an unset image shows a labelled
 * placeholder. The site is meant to look finished before any media exists.
 *
 * All media is a pasted URL. There are no file uploads anywhere on this site.
 */

import { get, set } from '../lib/kv.js';
import { seedFor } from '../lib/seed.js';
import {
  ok,
  badRequest,
  methodNotAllowed,
  readBody,
  clean,
  cleanUrl,
  withErrors,
} from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';

function cleanEmail(value) {
  const email = clean(value, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

/** Digits only — wa.me wants an international number with no +, spaces or dashes. */
function cleanPhone(value) {
  const digits = clean(value, 40).replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

/**
 * Force every stored value into a known shape. Anything not listed here is
 * dropped, so a malformed or malicious body can't add fields of its own.
 */
/*
  The six manifesto pillars — our 3 Rs and 3 Cs. The words and their lines live
  in the page markup (and are editable as text); only the background media for
  each is stored here. This list is the one place the keys are written down.
*/
const MANIFESTO_KEYS = [
  'revelation',
  'reality',
  'resolve',
  'contributing',
  'cultivating',
  'conversation',
];

/*
  The two full-width films — the ones that run the whole width of the screen at
  33:20, play themselves when you scroll to them and stop again when you leave.

    programmes  behind the heading above the table on /what-we-do
    break       the full-bleed break between the manifesto and the support band

  Each one is three things: the film, the still to show before it (and instead
  of it, for anyone who has asked their device to reduce motion), and a line of
  alt text describing the footage for a screen reader.
*/
const FILM_KEYS = ['programmes', 'break'];

/*
  The weekly rhythm — the list under the table on What We Do. Three columns a
  line: the day, the time, and what happens. Stored as a list rather than as
  page text because the number of lines changes; edit mode shows it as one
  box, one line per row, columns separated by a bar.
*/
const MAX_RHYTHM_ROWS = 12;

/*
  DONATION LINKS.

  Every one of these is a URL we paste in from somewhere else — Stripe payment
  links for the one-off and the five monthly amounts, and a LaunchGood campaign
  page. NOTHING about payment happens on this site: no card details are typed
  here, no keys are stored here, and there is no payment code anywhere in this
  repository. A donate button is a link, and the whole transaction happens on
  Stripe's or LaunchGood's own pages.

  That is deliberate, and it is the reason this is only six text fields.

  The five monthly amounts are in pounds, and the key for each is the amount
  with an `m` in front — £4 is `m4` — because an object key cannot start with
  a digit and be pleasant to work with. Changing the ladder is changing this
  one list; app.js reads the same numbers back out of the keys.
*/
const DONATE_TIERS = [4, 5, 10, 15, 20];
const tierKey = (amount) => `m${amount}`;

function cleanDonate(input) {
  const donate = input && typeof input === 'object' ? input : {};
  const monthly = donate.monthly && typeof donate.monthly === 'object' ? donate.monthly : {};
  return {
    oneOff: cleanUrl(donate.oneOff),
    launchgood: cleanUrl(donate.launchgood),
    monthly: Object.fromEntries(
      DONATE_TIERS.map((amount) => [tierKey(amount), cleanUrl(monthly[tierKey(amount)])])
    ),
  };
}

function cleanRhythm(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_RHYTHM_ROWS).map((row) => ({
    day: clean(row?.day, 40),
    time: clean(row?.time, 60),
    detail: clean(row?.detail, 160),
  })).filter((row) => row.day || row.time || row.detail);
}

function cleanFilm(input) {
  const film = input && typeof input === 'object' ? input : {};
  return {
    videoUrl: cleanUrl(film.videoUrl),
    posterUrl: cleanUrl(film.posterUrl),
    alt: clean(film.alt, 200),
  };
}

function sanitize(input) {
  const value = input && typeof input === 'object' ? input : {};
  const social = value.social ?? {};
  const hero = value.hero ?? {};
  const manifesto = value.manifesto ?? {};
  const films = value.films ?? {};

  return {
    contact: {
      email: cleanEmail(value.contact?.email),
      // Used to build the wa.me link. Not shown as a phone number anywhere.
      whatsappNumber: cleanPhone(value.contact?.whatsappNumber),
    },
    social: {
      instagram: cleanUrl(social.instagram),
      tiktok: cleanUrl(social.tiktok),
      youtube: cleanUrl(social.youtube),
      // A WhatsApp community/group invite link, which is separate from the
      // "message us" number above.
      whatsapp: cleanUrl(social.whatsapp),
    },

    /*
      The homepage hero. The video plays behind the organisation's name; the
      poster is the still shown before it loads, if it fails, and instead of it
      entirely for anyone who has asked for reduced motion. With neither set,
      the hero shows a labelled "Add hero video" placeholder.
    */
    hero: {
      videoUrl: cleanUrl(hero.videoUrl),
      posterUrl: cleanUrl(hero.posterUrl),
      /* What the footage shows, in words. The hero sits behind the
         organisation's name, so this is the only description of it there is. */
      alt: clean(hero.alt, 200),
    },

    /*
      One background image or video per manifesto pillar — the six words that
      take over the screen in turn. Keyed by pillar so they can be set
      independently; any that are empty simply show flat colour behind the word.
    */
    manifesto: Object.fromEntries(
      MANIFESTO_KEYS.map((key) => [key, cleanUrl(manifesto[key])])
    ),

    /*
      The full-width films. Both start empty, and an empty one renders as a
      labelled "Add video" frame at the right shape rather than as a hole.
    */
    films: Object.fromEntries(
      FILM_KEYS.map((key) => [key, cleanFilm(films[key])])
    ),

    /*
      The picture that comes up when somebody pastes a link to this site into
      WhatsApp, or posts it anywhere else. Used for every page EXCEPT an
      event's, which uses the event's own picture.

      Landscape, and roughly 1200x630 — that is the shape every one of those
      platforms crops to.
    */
    shareImageUrl: cleanUrl(value.shareImageUrl),

    /* The week, as shown under the programme table. */
    rhythm: cleanRhythm(value.rhythm),

    /* Where the Support Us buttons point. All start empty, and an amount with
       no link set simply is not shown — see renderSupport() in app.js. */
    donate: cleanDonate(value.donate),
  };
}

export default withErrors(async (req, res) => {
  const method = req.method?.toUpperCase();

  if (method === 'GET') {
    const stored = await get('settings');
    return ok(res, { settings: sanitize(stored ?? seedFor('settings')) });
  }

  if (method !== 'PUT') return methodNotAllowed(res, ['GET', 'PUT']);
  if (!requireAuth(req, res)) return;

  const body = await readBody(req);
  if (!body || typeof body !== 'object') return badRequest(res, 'Expected a JSON body.');

  // Merge over what is stored, so a partial update can't blank the rest.
  const current = sanitize((await get('settings')) ?? seedFor('settings'));
  const incoming = body.settings ?? body;
  const merged = sanitize({
    ...current,
    ...incoming,
    contact: { ...current.contact, ...(incoming.contact ?? {}) },
    social: { ...current.social, ...(incoming.social ?? {}) },
    hero: { ...current.hero, ...(incoming.hero ?? {}) },
    manifesto: { ...current.manifesto, ...(incoming.manifesto ?? {}) },
    /* One level deeper than the rest: each film is itself an object, so a form
       that changes only the poster must not blank the video URL beside it. */
    films: Object.fromEntries(FILM_KEYS.map((key) => [key, {
      ...(current.films?.[key] ?? {}),
      ...((incoming.films ?? {})[key] ?? {}),
    }])),
    /* A list, not an object: an incoming one REPLACES the stored one, because
       that is what "I deleted a line" has to mean. */
    rhythm: incoming.rhythm ?? current.rhythm,
    /* Two levels, like the films: a form that changes one monthly amount must
       not blank the other four. */
    donate: {
      ...current.donate,
      ...(incoming.donate ?? {}),
      monthly: {
        ...(current.donate?.monthly ?? {}),
        ...((incoming.donate ?? {}).monthly ?? {}),
      },
    },
  });

  await set('settings', merged);
  return ok(res, { settings: merged });
});

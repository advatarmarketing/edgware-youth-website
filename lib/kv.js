/**
 * The data layer. This is the ONE file to swap if the site ever moves off Redis.
 *
 * Everything above it only ever calls `get(key)` / `set(key, value)` with plain
 * JSON values, so replacing the driver below with Postgres, Supabase, Mongo —
 * whatever — is a rewrite of this file and nothing else.
 *
 * Which driver runs:
 *   - Upstash Redis, when KV_REST_API_URL + KV_REST_API_TOKEN are set. The
 *     "Upstash for Redis" integration on the Vercel Marketplace fills those in
 *     for you.
 *   - Otherwise a local JSON file at .data/store.json, so `vercel dev` works
 *     before the integration exists. That file store is NOT durable on Vercel —
 *     each serverless instance gets its own throwaway filesystem.
 *
 * (Vercel KV was the obvious first choice but has been retired as a first-party
 * product. @upstash/redis is its direct successor and the API is the same shape.)
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const URL_ENV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/*
  Local development must never write to the live database. Newer Vercel CLIs
  pull the production Upstash credentials into `vercel dev` automatically — at
  which point every local test edit would land on the real site. So local dev
  always uses the file store:
    - VERCEL_ENV is "development" under `vercel dev`
    - EY_LOCAL_STORE=1 in the local .env is a second, explicit guard
  Deployed functions (VERCEL_ENV "production" / "preview") are unaffected.
*/
const forceLocal =
  process.env.VERCEL_ENV === 'development' || process.env.EY_LOCAL_STORE === '1';

export const usingRedis = Boolean(URL_ENV && TOKEN_ENV) && !forceLocal;

/* ---------------------------------------------------------------- Redis --- */

let redisClient = null;

async function redis() {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({ url: URL_ENV, token: TOKEN_ENV });
  }
  return redisClient;
}

/* ----------------------------------------------------------- File store --- */

const FILE = path.join(process.cwd(), '.data', 'store.json');

async function readFileStore() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/*
  Written to a temporary file and then RENAMED into place.

  writeFile on its own truncates the file and then fills it, so anything that
  reads it in between gets half a file — and two writes that overlap produce
  one file with both of their contents in it, which is not valid JSON at all
  and takes the whole store with it. Renaming is atomic: readers see either
  the old file or the new one, never a half-written one.
*/
async function writeFileStore(store) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const temporary = `${FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8');
  await rename(temporary, FILE);
}

/*
  ONE WRITE AT A TIME.

  The atomic rename above stops a half-written file, but not a lost write:
  two saves that overlap would both read the store, both add their own key to
  their own copy, and the second would write over the first. Every write joins
  the end of this queue instead, so read-change-write always runs whole.

  This only matters for the local file store. On Redis each key is written on
  its own and the problem does not arise.

  WHAT THIS DOES NOT FIX, and does not need to: each /api route reads its
  whole object, changes one field and writes it back. If two people pressed
  Save at the same instant, both would have read the same object and the
  second would land on top of the first — on Redis exactly as much as here.
  Nothing is corrupted; one edit is simply lost.

  That is an acceptable trade for a site with one editor, and fixing it
  properly would mean per-key locking. If this ever grows to several people
  editing at once, that is the thing to build.
*/
let writeQueue = Promise.resolve();

function queueWrite(job) {
  const next = writeQueue.then(job, job);
  /* Keep the chain alive after a failure, but hand the real result back to
     whoever asked for this write. */
  writeQueue = next.catch(() => {});
  return next;
}

/* ------------------------------------------------------------ Public API --- */

/** Read a key. Returns `null` when the key has never been written. */
export async function get(key) {
  if (usingRedis) {
    const raw = await (await redis()).get(key);
    if (raw == null) return null;
    // Upstash auto-parses JSON it recognises; strings come back as strings.
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  const store = await readFileStore();
  return key in store ? store[key] : null;
}

/** Write a key. Value must be plain JSON. Returns the value written. */
export async function set(key, value) {
  if (usingRedis) {
    await (await redis()).set(key, JSON.stringify(value));
    return value;
  }
  await queueWrite(async () => {
    const store = await readFileStore();
    store[key] = value;
    await writeFileStore(store);
  });
  return value;
}

/** Read a key, falling back to `fallback` (and NOT writing it) when unset. */
export async function getOr(key, fallback) {
  const value = await get(key);
  return value == null ? fallback : value;
}

/** Read a collection, always returning an array. */
export async function getList(key) {
  const value = await get(key);
  return Array.isArray(value) ? value : [];
}

import type { APIRoute } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The redirects in force on this build (old product path -> current path).
// The next build reads them back (pipeline/fetch-published.ts), so a redirect
// lasts as long as its product stays on the site, not just one week.
export const GET: APIRoute = () => {
  const path = resolve(process.cwd(), process.env.SITE_DATA_DIR || 'data/site', 'redirects.json');
  const body = existsSync(path) ? readFileSync(path, 'utf8') : '{}';
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
};

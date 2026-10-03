// Lists the pages the live site currently publishes, from its sitemap and its
// redirects.json, so the select stage can keep those products (and redirect
// renamed ones) instead of letting a weekly re-rank turn indexed pages into 404s.
//
//   node pipeline/fetch-published.ts --site https://ultraornot.com --out data/published.txt
//
// Writes one site-relative path per line ("products/heinz-tomato-ketchup-5000157024671/").
// Never fails the build: if the site or sitemap can't be read (first deploy,
// outage), it writes an empty list and says so.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    site: { type: 'string' },
    out: { type: 'string', default: 'data/published.txt' },
  },
});

if (!args.site) throw new Error('--site is required, e.g. --site https://ultraornot.com');
const base = args.site.replace(/\/?$/, '/');

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const urls: string[] = [];
let complete = true;
const index = await get(`${base}sitemap-index.xml`);
if (index === null) {
  console.error(`No sitemap at ${base}sitemap-index.xml; treating the site as unpublished.`);
} else {
  for (const sitemapUrl of locs(index)) {
    const xml = await get(sitemapUrl);
    if (xml === null) {
      console.error(`Could not read ${sitemapUrl}; treating the site as unpublished.`);
      complete = false;
      break;
    }
    urls.push(...locs(xml));
  }
}

// Paths are taken relative to the home page URL listed in the sitemap, not
// to --site: right after a domain change the live sitemap still carries the
// old origin (e.g. heynils.github.io/potentially-processed/), and its pages
// still need keeping. A partial list would drop pages, so it's all or none.
const paths = new Set<string>();
if (complete && urls.length) {
  const root = urls.filter((u) => u.endsWith('/')).sort((a, b) => a.length - b.length)[0];
  if (root) {
    for (const u of urls) if (u.startsWith(root) && u !== root) paths.add(u.slice(root.length));
    // Old paths that currently redirect aren't in the sitemap, but they are
    // still linked from elsewhere: carry them forward so the redirects stay.
    const redirects = await get(`${root}redirects.json`);
    if (redirects !== null) {
      try {
        for (const from of Object.keys(JSON.parse(redirects))) paths.add(from);
      } catch {
        console.error('redirects.json is not valid JSON; ignoring it.');
      }
    }
  }
}

await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, [...paths].sort().join('\n') + (paths.size ? '\n' : ''));
const products = [...paths].filter((p) => p.startsWith('products/')).length;
console.error(`Published: ${paths.size} pages, ${products} of them products.`);

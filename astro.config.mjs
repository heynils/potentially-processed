// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import compactHtml from './src/integrations/compact-html.ts';

// SITE_URL and BASE_PATH are set by the deploy workflow from
// actions/configure-pages, so the same build works on
// https://<user>.github.io/<repo>/ and later on a custom domain at "/".
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';
const dataDir = process.env.SITE_DATA_DIR || 'data/site';

/** @param {string} name */
const readData = (name) => {
  const path = `${dataDir}/${name}.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
};

// Old product URL -> new one, for products renamed on Open Food Facts since
// the last deploy (see slugRedirects in pipeline/lib/build.ts). Astro writes
// a small page at the old path that sends visitors and crawlers on.
/** @type {Record<string, string>} */
const redirects = Object.fromEntries(
  // Astro resolves the source under `base` but not the destination.
  Object.entries(readData('redirects') ?? {}).map(([from, to]) => [`/${from}`, `${base}${to}`]),
);

// Product slug -> date the product was last edited on Open Food Facts, for
// <lastmod> in the sitemap. Crawlers use it to decide what to recrawl.
/** @type {Map<string, string>} */
const lastmod = new Map(
  (readData('products') ?? []).map((/** @type {{ slug: string; lastModified: number }} */ p) => [
    p.slug,
    new Date(p.lastModified * 1000).toISOString(),
  ]),
);

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  redirects,
  // With thousands of pages, shared CSS/JS files that the browser caches once
  // beat inlining a few KB into every page.
  build: { format: 'directory', inlineStylesheets: 'never' },
  scopedStyleStrategy: 'class',
  // compressHTML strips the whitespace between text and links that sit on
  // separate source lines ("from<a>"); gzip on the host makes up the bytes.
  compressHTML: false,
  vite: { build: { assetsInlineLimit: 0, cssCodeSplit: false } },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.slice(base.length - 1);
        return !/^\/(search|404)\/?$/.test(path) && !/\.(txt|json|svg)$/.test(path) && !(path in redirects);
      },
      serialize: (item) => {
        const slug = new URL(item.url).pathname.match(/\/products\/([^/]+)\/$/)?.[1];
        const date = slug && lastmod.get(slug);
        return date ? { ...item, lastmod: date } : item;
      },
    }),
    compactHtml(),
  ],
});

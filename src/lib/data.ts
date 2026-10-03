// Build-time access to the pipeline's output in data/site/.
// Astro pages run in Node during `astro build`, so plain fs reads are fine;
// nothing here ships to the browser.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SiteCategory, SiteLabels, SiteMarker, SiteMeta, SiteProduct } from '../../pipeline/lib/types.ts';

const DIR = resolve(process.cwd(), process.env.SITE_DATA_DIR || 'data/site');

function load<T>(name: string): T {
  const path = `${DIR}/${name}.json`;
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run \`npm run data:sample\` (committed sample) or \`npm run data\` (full export) first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export const meta = load<SiteMeta>('meta');
export const products = load<SiteProduct[]>('products');
export const categories = load<SiteCategory[]>('categories');
export const markers = load<SiteMarker[]>('markers');
export const labels = load<SiteLabels>('labels');

export const productByCode = new Map(products.map((p) => [p.code, p]));
export const categoryByTag = new Map(categories.map((c) => [c.tag, c]));
export const markerByTag = new Map(markers.map((m) => [m.tag, m]));

export const getProducts = (codes: string[]): SiteProduct[] =>
  codes.map((c) => productByCode.get(c)).filter((p): p is SiteProduct => Boolean(p));

// --- URLs -------------------------------------------------------------------

/** Prefixes the configured base path; `trailingSlash: 'always'` makes BASE_URL end in "/". */
export const href = (path = ''): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

export const productHref = (p: Pick<SiteProduct, 'slug'>) => href(`products/${p.slug}/`);
export const categoryHref = (c: Pick<SiteCategory, 'slug'>) => href(`categories/${c.slug}/`);
export const markerHref = (m: Pick<SiteMarker, 'slug' | 'kind'>) =>
  href(`${m.kind === 'additive' ? 'additives' : 'ingredients'}/${m.slug}/`);

export const offProductUrl = (code: string) => `https://world.openfoodfacts.org/product/${code}`;

// --- Formatting -------------------------------------------------------------

export const formatNumber = (n: number) => n.toLocaleString('en-US');
export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const formatDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

/** "E322 Lecithins" from OFF's "E322 - Lecithins"; tidies case of shouty names. */
export function additiveLabel(tag: string): string {
  const raw = labels.additives[tag] ?? tag.replace(/^en:/, '').toUpperCase();
  return raw.replace(/^(E\d+[a-z]*(?:\([ivx]+\))?)\s*-\s*(.)/i, (_, e: string, c: string) => `${e} ${c.toUpperCase()}`);
}

/** Display name for any marker tag, whether or not it has its own page. */
export function markerLabel(tag: string, type: 'ingredients' | 'additives' | 'categories'): string {
  const m = markerByTag.get(tag);
  if (m) return m.eNumber ? `${m.eNumber} ${m.name}` : m.name;
  if (type === 'additives') return additiveLabel(tag);
  if (type === 'categories') return labels.categories[tag] ?? humanize(tag);
  return humanize(tag);
}

export function humanize(tag: string): string {
  const s = tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Breakfast cereals" -> "breakfast cereals" for use mid-sentence, keeping acronyms and proper nouns. */
export function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** Brand first, the way people search: "Hellmann's Real Mayonnaise". */
export const productTitle = (p: Pick<SiteProduct, 'name' | 'brand'>) =>
  p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name;

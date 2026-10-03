// Build-time access to the pipeline's output in data/site/.
// Astro pages run in Node during `astro build`, so plain fs reads are fine;
// nothing here ships to the browser.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProductImage, SiteCategory, SiteLabels, SiteMarker, SiteMeta, SiteProduct } from '../../pipeline/lib/types.ts';

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

// --- Images -------------------------------------------------------------------

/**
 * Open Food Facts serves every product photo at 100, 200 and 400 px on its
 * longest side; the pipeline stores the 400 px URL and its dimensions. The
 * smaller versions only differ in the URL suffix, and keep the aspect ratio.
 */
export function imageAt(image: ProductImage, size: 100 | 200 | 400): ProductImage {
  const scale = Math.min(1, size / Math.max(image.width, image.height));
  return {
    url: image.url.replace(/\.400\.jpg$/, `.${size}.jpg`),
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  };
}

/** srcset with the 200 and 400 px versions at their real widths, for `sizes` to choose from. */
export const imageSrcset = (image: ProductImage): string =>
  ([200, 400] as const)
    .map((size) => imageAt(image, size))
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ');

const popularityRank = new Map(products.map((p, i) => [p.code, i]));

/** Photo of the most popular product in a category, to illustrate it in lists. */
export function categoryImage(category: Pick<SiteCategory, 'codes'>): ProductImage | null {
  // `products` is ordered most popular first.
  let best: SiteProduct | null = null;
  for (const code of category.codes) {
    const p = productByCode.get(code);
    if (p?.image && (!best || popularityRank.get(p.code)! < popularityRank.get(best.code)!)) best = p;
  }
  return best?.image ?? null;
}

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

/**
 * `lang` attribute for a product's own words (name, ingredient list) when
 * they aren't English, so screen readers pronounce "Kalles Kaviar" in
 * Swedish. The site's own text is English (<html lang="en">).
 */
export const textLang = (p: Pick<SiteProduct, 'lang'>): string | undefined => (p.lang !== 'en' ? p.lang : undefined);

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
/** "sv" -> "Swedish" */
export const languageName = (code: string): string => languageNames.of(code) ?? code;

const SMALL_WORDS = new Set(['and', 'of', 'the']);

/** "en:united-kingdom" -> "United Kingdom", "en:bosnia-and-herzegovina" -> "Bosnia and Herzegovina". */
export const countryName = (tag: string): string =>
  tag
    .replace(/^[a-z]{2}:/, '')
    .split('-')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** "United Kingdom" -> "the United Kingdom", for use in a sentence. */
export const withArticle = (country: string): string =>
  /^United |Republic$|^(Netherlands|Philippines|Bahamas|Gambia)$/.test(country) ? `the ${country}` : country;

/** "a, b and c" */
export const listJoin = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Countries the site serves (meta.countries, biggest first), for "sold in" and the search filter. */
export const servedCountries = meta.countries.map((c) => ({ ...c, name: countryName(c.tag) }));
const servedOrder = new Map(servedCountries.map((c, i) => [c.tag, i]));

/** Where a product is sold: the countries the site serves first, then the rest alphabetically. */
export function soldIn(p: Pick<SiteProduct, 'countries'>): string[] {
  const order = (t: string) => servedOrder.get(t) ?? Infinity;
  return p.countries
    .filter((t) => t !== 'en:world')
    .sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1))
    .map(countryName);
}

/** Brand first, the way people search: "Hellmann's Real Mayonnaise". */
export const productTitle = (p: Pick<SiteProduct, 'name' | 'brand'>) =>
  p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name;

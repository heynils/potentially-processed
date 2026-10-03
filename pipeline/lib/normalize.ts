// Turns one raw Open Food Facts product (a parsed JSONL line) into a slim,
// validated Candidate, or explains why it was rejected.
//
// The field names and shapes here were checked against the real export
// (openfoodfacts-products.jsonl.gz), including its quirks:
//   - nova_group is an int, but older records can carry it as a string;
//   - completeness can exceed 1 (seen: 1.0875);
//   - categories_hierarchy can be ["en:null"], or empty while categories_tags
//     has the categories;
//   - images use two schemas: legacy `images.front_en` and the newer
//     `images.selected.front.en`; there is no precomputed image URL.

import type { Candidate, Ingredient, Marker, MarkerType, NovaGroup, ProductImage } from './types.ts';

export type RejectReason =
  | 'no-nova-group'
  | 'other-language'
  | 'obsolete'
  | 'bad-code'
  | 'no-name'
  | 'no-ingredients'
  | 'no-category';

export type NormalizeResult = { ok: true; candidate: Candidate } | { ok: false; reason: RejectReason };

// The raw export has ~500 loosely typed fields; we only touch a few.
type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** OFF marks allergens with underscores on the pack text: "_wheat_ flour". */
export const stripAllergenMarks = (s: string): string => s.replace(/_([^_]+)_/g, '$1');

/** Canonical English taxonomy tags only; the export also has free-text ones like "en:Plain Flour". */
const isEnglishTag = (t: string): boolean => /^en:[a-z0-9][a-z0-9-]*$/.test(t);

export function parseNova(v: unknown): NovaGroup | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseInt(v, 10) : NaN;
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

const MARKER_TYPES = new Set<MarkerType>(['ingredients', 'additives', 'categories']);

/** `nova_groups_markers` looks like {"4": [["additives", "en:e322"], ...], "3": [...]}. */
export function parseMarkers(v: unknown): Marker[] {
  if (!v || typeof v !== 'object') return [];
  const out: Marker[] = [];
  const seen = new Set<string>();
  for (const [groupKey, list] of Object.entries(v as Record<string, unknown>)) {
    const group = parseNova(groupKey);
    if (!group || !Array.isArray(list)) continue;
    for (const pair of list) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [type, tag] = pair;
      if (typeof tag !== 'string' || !MARKER_TYPES.has(type as MarkerType)) continue;
      const key = `${group}|${type}|${tag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ group, type: type as MarkerType, tag });
    }
  }
  // Strongest markers first, so templates can just take the head of the list.
  return out.sort((a, b) => b.group - a.group);
}

/** Keeps id/text/printed percent from OFF's ingredient tree; drops estimates and flags. */
export function parseIngredients(v: unknown, depth = 0): Ingredient[] {
  if (!Array.isArray(v) || depth > 6) return [];
  const out: Ingredient[] = [];
  for (const node of v) {
    if (!node || typeof node !== 'object') continue;
    const n = node as Raw;
    const text = stripAllergenMarks(str(n.text));
    const id = str(n.id);
    if (!text && !id) continue;
    const ing: Ingredient = { id, text: text || id.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ') };
    // `percent` is only present when the pack states it; `percent_estimate` is OFF's guess.
    const percent = typeof n.percent === 'number' ? n.percent : typeof n.percent === 'string' ? Number(n.percent) : NaN;
    if (Number.isFinite(percent) && percent > 0 && percent <= 100) ing.percent = percent;
    const children = parseIngredients(n.ingredients, depth + 1);
    if (children.length) ing.children = children;
    out.push(ing);
  }
  return out;
}

/**
 * OFF image paths split barcodes into folders: 3017620422003 -> 301/762/042/2003.
 * Codes of 8 digits or fewer are not split; longer codes are left-padded to 13.
 */
export function barcodePath(code: string): string {
  if (code.length <= 8) return code;
  const padded = code.padStart(13, '0');
  const m = padded.match(/^(.{3})(.{3})(.{3})(.*)$/);
  return m ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}` : padded;
}

interface ImageRef {
  rev: string | number;
  sizes?: Record<string, { w?: number; h?: number }>;
}

function pickFrontImage(images: unknown, lang: string): { ref: ImageRef; lang: string } | null {
  if (!images || typeof images !== 'object') return null;
  const imgs = images as Record<string, unknown>;
  const candidates: [string, unknown][] = [];
  // Newer schema: images.selected.front.<lang>
  const selected = (imgs.selected as Record<string, Record<string, unknown>> | undefined)?.front;
  if (selected && typeof selected === 'object') {
    for (const [l, ref] of Object.entries(selected)) candidates.push([l, ref]);
  }
  // Legacy schema: images.front_<lang>
  for (const [key, ref] of Object.entries(imgs)) {
    const m = key.match(/^front_([a-z]{2})$/);
    if (m) candidates.push([m[1], ref]);
  }
  const valid = candidates.filter(
    ([, ref]) => ref && typeof ref === 'object' && (ref as ImageRef).rev !== undefined && (ref as ImageRef).rev !== null,
  ) as [string, ImageRef][];
  const preferred = valid.find(([l]) => l === lang) ?? valid.find(([l]) => l === 'en') ?? valid[0];
  return preferred ? { lang: preferred[0], ref: preferred[1] } : null;
}

export function frontImage(code: string, images: unknown, lang: string): ProductImage | null {
  const picked = pickFrontImage(images, lang);
  if (!picked) return null;
  const size = picked.ref.sizes?.['400'];
  const width = num(size?.w);
  const height = num(size?.h);
  if (!width || !height) return null;
  return {
    url: `https://images.openfoodfacts.org/images/products/${barcodePath(code)}/front_${picked.lang}.${picked.ref.rev}.400.jpg`,
    width,
    height,
  };
}

/** OFF names are often shouted ("CHAMOMILE HERBAL TEA", "ÄPPELMOS"); tame all-caps names only. */
export function tidyName(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  const letters = cleaned.replace(/\P{L}/gu, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    return cleaned.toLowerCase().replace(/(^|[\s\-/(])(\p{Ll})/gu, (_, p: string, c: string) => p + c.toUpperCase());
  }
  return cleaned;
}

/**
 * The language OFF parsed the ingredient list in, which is the language the
 * page shows it in: `ingredients_lc` (older records only have `lang`, the
 * pack's main language; the two differ when, say, a Swedish-labelled product
 * only has its ingredients typed in French).
 */
export const ingredientsLanguage = (raw: Raw): string => str(raw.ingredients_lc) || str(raw.lang);

/** `languages`: the languages a page can show a product in (config LANGUAGES). */
export function normalize(raw: Raw, languages: ReadonlySet<string>): NormalizeResult {
  const nova = parseNova(raw.nova_group);
  if (!nova) return { ok: false, reason: 'no-nova-group' };

  // The name, the ingredient list as printed and OFF's parsed ingredient tree
  // must all be in one language the site supports.
  const lang = ingredientsLanguage(raw);
  if (!languages.has(lang)) return { ok: false, reason: 'other-language' };
  // `product_name` and `ingredients_text` are in the pack's main language.
  const inLang = (field: string) => str(raw[`${field}_${lang}`]) || (str(raw.lang) === lang ? str(raw[field]) : '');

  if (raw.obsolete === true || raw.obsolete === 'on' || raw.obsolete === 1) return { ok: false, reason: 'obsolete' };

  const code = str(raw.code);
  if (!/^\d{8,14}$/.test(code)) return { ok: false, reason: 'bad-code' };

  const name = tidyName(inLang('product_name'));
  if (name.length < 3) return { ok: false, reason: 'no-name' };

  const ingredientsText = stripAllergenMarks(inLang('ingredients_text'));
  const ingredients = parseIngredients(raw.ingredients);
  if (!ingredientsText || ingredients.length === 0) return { ok: false, reason: 'no-ingredients' };

  // Many records (a quarter of Swedish ones) have an empty
  // categories_hierarchy but canonical categories_tags; use those then. May
  // still be empty: whether a product without a category is wanted is the
  // extract stage's call (see poolReject in markets.ts).
  const englishTags = (field: unknown) => strArray(field).filter((t) => isEnglishTag(t) && t !== 'en:null');
  const hierarchy = englishTags(raw.categories_hierarchy);
  const categories = hierarchy.length ? hierarchy : englishTags(raw.categories_tags);

  const comparedTo = str(raw.compared_to_category);
  const nutri = str(raw.nutriscore_grade);
  const brand = str(raw.brands).split(',')[0]?.trim() || null;

  return {
    ok: true,
    candidate: {
      code,
      lang,
      name,
      brand,
      quantity: str(raw.quantity) || null,
      nova,
      markers: parseMarkers(raw.nova_groups_markers),
      ingredientsText,
      ingredients,
      additives: strArray(raw.additives_tags),
      categories,
      comparedTo: comparedTo.startsWith('en:') && categories.includes(comparedTo) ? comparedTo : null,
      countries: strArray(raw.countries_tags).filter(isEnglishTag),
      nutriscore: /^[a-e]$/.test(nutri) ? (nutri as Candidate['nutriscore']) : null,
      image: frontImage(code, raw.images, lang),
      popularity: num(raw.popularity_key),
      scans: num(raw.unique_scans_n),
      completeness: Math.min(1, Math.max(0, num(raw.completeness))),
      lastModified: num(raw.last_modified_t),
    },
  };
}

/**
 * The leading two digits of OFF's popularity_key are the year of the scan
 * statistics that placed it (e.g. 24999990054 -> 24); small keys without a
 * year prefix are products with no recent scan statistics at all.
 */
export const scanYear = (popularityKey: number): number => (popularityKey >= 1e9 ? Math.floor(popularityKey / 1e9) : 0);

/**
 * "Most popular first", used everywhere a ranking is needed.
 *
 * OFF's popularity_key alone is not a good global order: after the year it
 * encodes a percentile tier computed per country, so the 50th most scanned
 * product in a small market outranks a staple scanned by thousands in the
 * UK. We keep its year (recently scanned products first, which also pushes
 * discontinued ones down), then use the actual number of distinct scanners.
 */
export function compareRank(a: Candidate, b: Candidate): number {
  return (
    scanYear(b.popularity) - scanYear(a.popularity) ||
    b.scans - a.scans ||
    b.popularity - a.popularity ||
    b.completeness - a.completeness ||
    b.lastModified - a.lastModified ||
    (a.code < b.code ? -1 : 1)
  );
}

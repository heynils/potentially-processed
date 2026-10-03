// Tunables for the data pipeline. Change these, not the code.

import type { MarketQuota } from './lib/markets.ts';

export const EXPORT_URL = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
export const TAXONOMY_URL = 'https://static.openfoodfacts.org/data/taxonomies';
export const TAXONOMIES = ['categories', 'ingredients', 'additives', 'additives_classes'] as const;

export const WORK_DIR = 'data/work';
export const SITE_DATA_DIR = 'data/site';

/**
 * Languages a product page can be shown in: OFF must have parsed the
 * ingredient list in one of these, and the product needs a name in it. The
 * site's own text stays English; Swedish names and ingredient lists are
 * shown as printed, marked up with lang="sv".
 */
export const LANGUAGES: ReadonlySet<string> = new Set(['en', 'sv']);

/**
 * How many products end up on the site: as many as GitHub Pages' 1 GB site
 * limit allows. Product pages are ~20 KB each (after compact-html), so
 * 40,000 products make a ~880 MB site; the rest of the gigabyte is headroom
 * for weekly data changes and the AdSense markup. The deploy workflow fails
 * the build if the site grows past 1 GB.
 */
export const TARGET_PRODUCTS = 40000;

/**
 * Share of TARGET_PRODUCTS reserved for less-processed products pulled in
 * so that popular ultra-processed products have alternatives to point to.
 */
export const BALANCE_SHARE = 0.2;

/**
 * How many eligible products the extract stage keeps (every product of a
 * quota market, then the most popular of the rest). The select stage chooses
 * TARGET_PRODUCTS from this pool, so it must be comfortably larger to leave
 * room for dedupe (~8%) and balancing. ~270 MB on disk.
 */
export const POOL_SIZE = 150000;

/**
 * The markets the site serves. Products sold in these countries rank ahead
 * of the rest (then by popularity), and a product page prefers alternatives
 * sold in the same country. Many heavily scanned products with English
 * labels are sold only elsewhere (Morocco is a large OFF market).
 */
export const PRIORITY_COUNTRIES = new Set([
  'en:united-kingdom',
  'en:united-states',
  'en:ireland',
  'en:canada',
  'en:australia',
  'en:new-zealand',
  'en:sweden',
]);

/**
 * Markets that get places on the site whatever their scan counts, before
 * the rest is filled by popularity: Swedish products are scanned far less
 * than British or American ones, so few would make it otherwise. A product
 * belongs to a market if it is sold there or labelled in its language.
 */
export const MARKET_QUOTAS: MarketQuota[] = [{ name: 'Sweden', countries: ['en:sweden'], languages: ['sv'], max: 20000 }];

/** A category gets its own page once it has this many selected products. */
export const MIN_CATEGORY_PAGE = 8;

/** A marker (ingredient or additive) gets its own page at this many products. */
export const MIN_MARKER_PAGE = 5;

export const MAX_ALTERNATIVES = 4;
export const MAX_RELATED = 4;

/**
 * Root categories too broad to be useful as a page or as a source of
 * "alternatives" (comparing crisps to milk because both are "foods").
 */
export const GENERIC_CATEGORIES = new Set([
  'en:plant-based-foods-and-beverages',
  'en:plant-based-foods',
  'en:foods-of-animal-origin',
  'en:beverages-and-beverages-preparations',
  'en:beverages',
  'en:groceries',
  'en:meals',
  'en:snacks',
  'en:dairies',
  'en:fermented-foods',
  'en:fermented-milk-products',
  'en:frozen-foods',
  'en:canned-foods',
  'en:dried-products',
  'en:dried-products-to-be-rehydrated',
  'en:null',
  'en:undefined',
]);

/**
 * Extra "is a" links for marker matching, for ingredient ids the OFF
 * ingredients taxonomy does not connect to the additive OFF reports as the
 * marker. Each was observed in the real export (unplaced markers report).
 */
export const EXTRA_INGREDIENT_PARENTS: Record<string, string[]> = {
  'en:modified-starch': ['en:e14xx'],
  'en:fruit-pectin': ['en:e440'],
  'en:citrus-pectin': ['en:e440'],
  'en:vegetable-glycerin': ['en:e422'],
  'en:vegetable-glycerol': ['en:e422'],
};

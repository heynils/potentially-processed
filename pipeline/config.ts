// Tunables for the data pipeline. Change these, not the code.

export const EXPORT_URL = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
export const TAXONOMY_URL = 'https://static.openfoodfacts.org/data/taxonomies';
export const TAXONOMIES = ['categories', 'ingredients', 'additives', 'additives_classes'] as const;

export const WORK_DIR = 'data/work';
export const SITE_DATA_DIR = 'data/site';

/** How many products end up on the site. */
export const TARGET_PRODUCTS = 5000;

/**
 * Share of TARGET_PRODUCTS reserved for less-processed products pulled in
 * so that popular ultra-processed products have alternatives to point to.
 */
export const BALANCE_SHARE = 0.2;

/**
 * How many of the most popular eligible products the extract stage keeps.
 * The select stage chooses TARGET_PRODUCTS from this pool, so it must be
 * comfortably larger to leave room for dedupe and balancing.
 */
export const POOL_SIZE = 60000;

/** A category gets its own page once it has this many selected products. */
export const MIN_CATEGORY_PAGE = 8;

/** A marker (ingredient or additive) gets its own page at this many products. */
export const MIN_MARKER_PAGE = 5;

export const MAX_ALTERNATIVES = 4;
export const MAX_RELATED = 6;

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

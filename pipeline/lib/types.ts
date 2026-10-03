// Shared data contracts between the pipeline and the Astro site.
//
// The pipeline runs in two stages:
//   extract: OFF JSONL export (one product per line) -> Candidate records
//   select:  Candidates + OFF taxonomies -> SiteData (what Astro renders)
// Everything here is plain JSON so it can be written to disk between stages.

export type NovaGroup = 1 | 2 | 3 | 4;

/** Which part of a product triggered a NOVA marker, as reported by OFF. */
export type MarkerType = 'ingredients' | 'additives' | 'categories';

/**
 * A NOVA marker is the reason OFF assigned a product to a given group.
 * `group` is the group the marker pushes the product into (OFF reports
 * markers for groups 2, 3 and 4; group 1 has none by definition).
 */
export interface Marker {
  group: NovaGroup;
  type: MarkerType;
  tag: string; // OFF taxonomy id, e.g. "en:maltodextrin", "en:e471"
}

/** One node of OFF's parsed ingredient tree. */
export interface Ingredient {
  id: string; // taxonomy id, e.g. "en:soya-lecithin" (may be unknown to the taxonomy)
  text: string; // as written on the pack
  percent?: number; // only when printed on the pack, not OFF's estimate
  children?: Ingredient[];
}

export interface ProductImage {
  url: string;
  width: number;
  height: number;
}

/** Output of the extract stage: a slimmed-down, validated OFF product. */
export interface Candidate {
  code: string;
  /** Language of the name and ingredient list, as shown: "en" or "sv" (config LANGUAGES). */
  lang: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  nova: NovaGroup;
  markers: Marker[];
  ingredientsText: string;
  ingredients: Ingredient[];
  additives: string[]; // e.g. ["en:e322", "en:e471"]
  categories: string[]; // OFF categories_hierarchy, English tags only, generic -> specific
  comparedTo: string | null; // OFF's own choice of most specific comparison category
  countries: string[]; // OFF countries_tags: where it is sold, e.g. ["en:sweden"]
  nutriscore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
  image: ProductImage | null;
  popularity: number; // OFF popularity_key: year of latest scan stats, a per-country percentile tier, then scans
  scans: number; // OFF unique_scans_n: distinct people who scanned the barcode with the OFF app
  completeness: number; // 0..1
  lastModified: number; // unix seconds
}

/** An ingredient node after marker matching, ready to render. */
export interface SiteIngredient {
  text: string;
  percent?: number;
  /** Highest NOVA group among markers matched to this ingredient (3 or 4), if any. */
  markerGroup?: NovaGroup;
  /** Marker tags matched to this ingredient (keys into SiteData.markers). */
  markerTags?: string[];
  children?: SiteIngredient[];
}

export interface SiteProduct {
  code: string;
  slug: string;
  /** Language of `name`, `ingredientsText` and the ingredient texts; the site's own text is English. */
  lang: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  nova: NovaGroup;
  markers: Marker[];
  /** Marker tags (ingredient/additive) that could not be placed in the ingredient tree. */
  unplacedMarkers: string[];
  ingredientsText: string;
  ingredients: SiteIngredient[];
  ingredientCount: number;
  additives: string[];
  nutriscore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
  countries: string[];
  image: ProductImage | null;
  lastModified: number;
  /** Most specific category that has its own page. */
  category: string | null;
  /** Category chain with pages, generic -> specific, ending in `category`. */
  breadcrumb: string[];
  /** 1-based position within `category` when sorted least -> most processed. */
  categoryRank: number | null;
  alternatives: {
    /** Category the alternatives were drawn from (may be a parent of `category`). */
    category: string | null;
    codes: string[];
  };
  /** Other products from the same category, for internal linking. */
  related: string[];
}

export interface SiteCategory {
  tag: string;
  slug: string;
  name: string;
  parent: string | null; // nearest ancestor that also has a page
  children: string[]; // categories with pages whose nearest page-ancestor is this one
  count: number;
  novaCounts: Record<NovaGroup, number>;
  /** All product codes, sorted least -> most processed. */
  codes: string[];
  /** Most frequent group-4 markers in this category: [tag, count]. */
  topMarkers: [string, number][];
}

export interface SiteMarker {
  tag: string;
  slug: string;
  name: string;
  /** "ingredient" or "additive" (category markers do not get pages). */
  kind: 'ingredient' | 'additive';
  /** NOVA group the marker implies; null for a common additive that is not a marker. */
  group: NovaGroup | null;
  /** OFF additive classes, e.g. ["en:emulsifier"]; empty for ingredients. */
  classes: string[];
  eNumber: string | null;
  wikidata: string | null;
  count: number;
  /** Product codes containing this marker, most popular first. */
  codes: string[];
  /** Categories where this marker is most common: [tag, count]. */
  topCategories: [string, number][];
}

/** Counts of products surviving each step, shown on the About page. */
export interface Funnel {
  linesRead: number;
  parseErrors: number;
  rejected: Record<string, number>;
  eligible: number;
  pooled: number;
  /** Dropped from the pool for evidently truncated ingredient lists. */
  implausible: number;
  afterDedupe: number;
  selected: number;
  selectedForBalance: number;
  /** Per quota market (config MARKET_QUOTAS): its places, eligible products in the export, and products on the site. */
  markets: { name: string; countries: string[]; languages: string[]; max: number; eligible: number; selected: number }[];
}

export interface SiteMeta {
  /** "export" for a real OFF export, "fixture" for the committed sample. */
  source: 'export' | 'fixture';
  input: string;
  exportDate: string | null; // Last-Modified of the export, if known
  generatedAt: string;
  funnel: Funnel;
  novaCounts: Record<NovaGroup, number>;
  /** The countries the site serves (config PRIORITY_COUNTRIES) and how many products are sold in each, most first. */
  countries: { tag: string; products: number }[];
  /** How the product set compares with what the live site published before this build. */
  continuity: { published: number; kept: number; renamed: number; dropped: number };
}

/** English display names resolved from the OFF taxonomies. */
export interface SiteLabels {
  /** Every additive found in a selected product: "en:e322" -> "E322 - Lecithins". */
  additives: Record<string, string>;
  /** Functional classes from the EU additive regulation, with OFF's definition text. */
  additiveClasses: Record<string, { name: string; description: string | null }>;
  /** Names for category tags used by category-type NOVA markers. */
  categories: Record<string, string>;
}

export interface SiteData {
  meta: SiteMeta;
  products: SiteProduct[];
  categories: SiteCategory[];
  markers: SiteMarker[];
  labels: SiteLabels;
}

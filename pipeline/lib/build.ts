// Pure functions that turn the candidate pool into the site's data model.
// No I/O here, so everything is unit-testable (see pipeline/test/).

import { slugify, productSlug } from './slug.ts';
import { humanizeTag, type Taxonomies, type Taxonomy } from './taxonomy.ts';
import { compareRank } from './normalize.ts';
import type {
  Candidate,
  Ingredient,
  Marker,
  NovaGroup,
  SiteCategory,
  SiteIngredient,
  SiteLabels,
  SiteMarker,
  SiteProduct,
} from './types.ts';

export interface BuildOptions {
  /** Best-first ordering of products; see marketFirst(). */
  compare: (a: Candidate, b: Candidate) => number;
  target: number;
  balanceShare: number;
  minCategoryPage: number;
  minMarkerPage: number;
  maxAlternatives: number;
  maxRelated: number;
  generic: Set<string>;
  extraIngredientParents: Record<string, string[]>;
}

const emptyNovaCounts = (): Record<NovaGroup, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

// ---------------------------------------------------------------------------
// Ranking

/** compareRank, but products sold in a priority country come first. */
export function marketFirst(priority: Set<string>): (a: Candidate, b: Candidate) => number {
  const inMarket = (c: Candidate) => (c.countries.some((t) => priority.has(t)) ? 1 : 0);
  return (a, b) => inMarket(b) - inMarket(a) || compareRank(a, b);
}

// ---------------------------------------------------------------------------
// Data quality

/**
 * Crowdsourced ingredient lists are sometimes truncated to one entry. A
 * product whose whole list is "water" (a fat-free mayonnaise, in the real
 * data) or a single additive ("organic lecithins" for a box of corn flakes)
 * would show as minimally processed and get recommended as an alternative.
 * Single-ingredient products are otherwise legitimate (oats, flour, plain
 * yoghurt), so only these two patterns are dropped.
 */
export function hasImplausibleIngredients(c: Candidate, ingredientAncestorsOf: (id: string) => Set<string>): boolean {
  if (c.ingredients.length !== 1 || c.ingredients[0].children?.length) return false;
  const id = c.ingredients[0].id;
  if (id === 'en:water') return !c.categories.some((t) => t === 'en:waters' || t.endsWith('-waters'));
  return [...ingredientAncestorsOf(id)].some((t) => /^en:e\d/.test(t));
}

// ---------------------------------------------------------------------------
// Dedupe

/**
 * The same product often exists under several barcodes (pack sizes, regional
 * prints, re-entries). Pages for each would be near-duplicates, which search
 * engines treat as thin content, so we keep the most popular barcode only.
 */
export function dedupeKey(c: Candidate): string {
  const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${norm(c.brand)}|${norm(c.name)}`;
}

/** Input must be sorted best-first (see BuildOptions.compare); the first of each key wins. */
export function dedupe(pool: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return pool.filter((c) => {
    const key = dedupeKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Selection

/**
 * Categories in which to look for alternatives to `c`, most specific first:
 * OFF's own comparison category, then the deepest remaining categories.
 * Overly generic roots ("Plant-based foods") are excluded.
 */
export function comparisonScopes(c: Candidate, categories: Taxonomy, generic: Set<string>, limit = 3): string[] {
  const known = c.categories.filter((t) => categories.has(t) && !generic.has(t));
  known.sort((a, b) => categories.depth(b) - categories.depth(a));
  if (c.comparedTo && known.includes(c.comparedTo)) {
    known.splice(known.indexOf(c.comparedTo), 1);
    known.unshift(c.comparedTo);
  }
  return known.slice(0, limit);
}

/**
 * Picks `target` products from the pool (sorted best-first by opts.compare).
 *
 * Taking the top N by popularity alone would give a site where a popular
 * ultra-processed product often has nothing less processed to point to,
 * because the less-processed items in its category are less scanned. So:
 *   1. take the most popular (1 - balanceShare) * target products;
 *   2. walk them in popularity order and, for each NOVA 2-4 product whose
 *      category has fewer than two less-processed products selected, pull
 *      the most popular less-processed ones from the pool (climbing to a
 *      broader category if the specific one has none), until the reserved
 *      balanceShare * target slots are used;
 *   3. fill whatever is left by popularity.
 */
export function selectProducts(
  pool: Candidate[],
  categories: Taxonomy,
  opts: Pick<BuildOptions, 'target' | 'balanceShare' | 'generic' | 'compare'>,
): { selected: Candidate[]; balanced: number } {
  const WANT_LOWER = 2;
  const reserve = Math.round(opts.target * opts.balanceShare);
  const coreSize = Math.min(pool.length, opts.target - reserve);

  const selected: Candidate[] = [];
  const chosen = new Set<string>();
  const novaByCategory = new Map<string, number[]>();
  const add = (c: Candidate) => {
    selected.push(c);
    chosen.add(c.code);
    for (const t of c.categories) {
      let counts = novaByCategory.get(t);
      if (!counts) novaByCategory.set(t, (counts = [0, 0, 0, 0, 0]));
      counts[c.nova]++;
    }
  };
  const lowerCount = (category: string, nova: NovaGroup) => {
    const counts = novaByCategory.get(category);
    let n = 0;
    if (counts) for (let g = 1; g < nova; g++) n += counts[g];
    return n;
  };

  for (const c of pool.slice(0, coreSize)) add(c);

  const poolByCategory = new Map<string, Candidate[]>();
  for (const c of pool) {
    for (const t of c.categories) {
      let list = poolByCategory.get(t);
      if (!list) poolByCategory.set(t, (list = []));
      list.push(c);
    }
  }

  let balanced = 0;
  outer: for (const p of selected.slice(0, coreSize)) {
    if (balanced >= reserve) break;
    if (p.nova === 1) continue;
    for (const scope of comparisonScopes(p, categories, opts.generic)) {
      if (lowerCount(scope, p.nova) >= WANT_LOWER) continue outer;
      for (const q of poolByCategory.get(scope) ?? []) {
        if (lowerCount(scope, p.nova) >= WANT_LOWER || balanced >= reserve) break;
        if (q.nova < p.nova && !chosen.has(q.code)) {
          add(q);
          balanced++;
        }
      }
      if (lowerCount(scope, p.nova) >= WANT_LOWER) continue outer;
    }
  }

  for (const c of pool) {
    if (selected.length >= opts.target) break;
    if (!chosen.has(c.code)) add(c);
  }
  return { selected: selected.sort(opts.compare), balanced };
}

// ---------------------------------------------------------------------------
// Ingredients

/**
 * Walks OFF's ingredient tree and attaches each ingredient/additive marker to
 * every ingredient it is an ancestor of (or equal to) in the ingredients
 * taxonomy. Examples from the real data:
 *   marker en:whey   matches ingredient en:whey-powder        (parent)
 *   marker en:e322   matches ingredient en:soya-lecithin      (via en:e322i)
 * A marker already shown on a parent is not repeated on its children.
 */
export function annotateIngredients(
  ingredients: Ingredient[],
  markers: Marker[],
  ancestorsOf: (id: string) => Set<string>,
): { tree: SiteIngredient[]; placed: Set<string>; count: number } {
  const placeable = markers.filter((m) => m.type !== 'categories');
  const placed = new Set<string>();
  let count = 0;

  const walk = (nodes: Ingredient[], inherited: Set<string>): SiteIngredient[] =>
    nodes.map((node) => {
      count++;
      const out: SiteIngredient = { text: node.text };
      if (node.percent !== undefined) out.percent = node.percent;
      const ancestors = node.id ? ancestorsOf(node.id) : new Set<string>();
      const matched = placeable.filter((m) => ancestors.has(m.tag));
      for (const m of matched) placed.add(m.tag);
      const fresh = matched.filter((m) => !inherited.has(m.tag));
      if (fresh.length) {
        out.markerTags = [...new Set(fresh.map((m) => m.tag))];
        out.markerGroup = Math.max(...fresh.map((m) => m.group)) as NovaGroup;
      }
      if (node.children?.length) {
        out.children = walk(node.children, new Set([...inherited, ...matched.map((m) => m.tag)]));
      }
      return out;
    });

  return { tree: walk(ingredients, new Set()), placed, count };
}

/**
 * Ancestors of an ingredient id for marker matching. On top of the ingredients
 * taxonomy this adds links neither OFF taxonomy records:
 *   - additive variants to their base number: en:e440a -> en:e440
 *   - modified starches E1400-E1452 to OFF's group tag en:e14xx
 *   - explicit aliases from config (EXTRA_INGREDIENT_PARENTS)
 */
export function ingredientAncestors(taxonomy: Taxonomy, extraParents: Record<string, string[]>): (id: string) => Set<string> {
  const cache = new Map<string, Set<string>>();
  return (id: string) => {
    let out = cache.get(id);
    if (out) return out;
    out = new Set(taxonomy.ancestors(id));
    for (const tag of [...out]) {
      for (const extra of extraParents[tag] ?? []) for (const a of taxonomy.ancestors(extra)) out.add(a);
      const variant = tag.match(/^en:e(\d+)[a-z]+$/);
      if (variant && tag !== 'en:e14xx') out.add(`en:e${variant[1]}`);
      if (/^en:e14[0-5]\d/.test(tag)) out.add('en:e14xx');
    }
    cache.set(id, out);
    return out;
  };
}

// ---------------------------------------------------------------------------
// Site model

export interface BuiltSite {
  products: SiteProduct[];
  categories: SiteCategory[];
  markers: SiteMarker[];
  labels: SiteLabels;
}

/** Splits OFF's "E322 - Lecithins" into ["E322", "Lecithins"]. */
export function splitAdditiveName(name: string): [string | null, string] {
  const m = name.match(/^(E\s?\d+[a-z]*(?:\([ivx]+\))?)\s*[-–:]\s*(.+)$/i);
  return m ? [m[1].replace(/\s/g, '').toUpperCase().replace(/(\d)([A-Z]+)$/, (_, d: string, s: string) => d + s.toLowerCase()), m[2].trim()] : [null, name];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildSite(selected: Candidate[], tax: Taxonomies, opts: BuildOptions): BuiltSite {
  const cats = tax.categories;
  const rankIndex = new Map(selected.map((c, i) => [c.code, i]));
  const byCode = new Map(selected.map((c) => [c.code, c]));

  // --- ingredient annotation (needed for sort keys) -------------------------
  const ancestorsOf = ingredientAncestors(tax.ingredients, opts.extraIngredientParents);
  const annotated = new Map(selected.map((c) => [c.code, annotateIngredients(c.ingredients, c.markers, ancestorsOf)]));
  const group4Count = (c: Candidate) => c.markers.filter((m) => m.group === 4).length;

  /**
   * "Least processed first" ordering inside a category: NOVA group, then the
   * number of group-4 markers, additives and ingredients, then popularity.
   * This is our own browsing order, not part of the NOVA system.
   */
  const processingOrder = (a: string, b: string) => {
    const pa = byCode.get(a)!;
    const pb = byCode.get(b)!;
    return (
      pa.nova - pb.nova ||
      group4Count(pa) - group4Count(pb) ||
      pa.additives.length - pb.additives.length ||
      annotated.get(a)!.count - annotated.get(b)!.count ||
      rankIndex.get(a)! - rankIndex.get(b)!
    );
  };

  // --- categories -----------------------------------------------------------
  const members = new Map<string, string[]>();
  for (const c of selected) {
    for (const t of c.categories) {
      if (opts.generic.has(t) || !cats.name(t)) continue;
      let list = members.get(t);
      if (!list) members.set(t, (list = []));
      list.push(c.code);
    }
  }
  const pageTags = new Set([...members].filter(([, codes]) => codes.length >= opts.minCategoryPage).map(([t]) => t));

  /** Nearest ancestor(s) with a page, breadth-first; ties go to the larger category. */
  const pageParent = (tag: string): string | null => {
    let frontier = cats.parents(tag);
    const seen = new Set<string>(frontier);
    while (frontier.length) {
      const hits = frontier.filter((t) => pageTags.has(t));
      if (hits.length) return hits.sort((a, b) => members.get(b)!.length - members.get(a)!.length)[0];
      const next: string[] = [];
      for (const t of frontier) for (const p of cats.parents(t)) if (!seen.has(p)) (seen.add(p), next.push(p));
      frontier = next;
    }
    return null;
  };

  const usedCategorySlugs = new Set<string>();
  const categories = new Map<string, SiteCategory>();
  for (const tag of [...pageTags].sort()) {
    const codes = [...members.get(tag)!].sort(processingOrder);
    const novaCounts = emptyNovaCounts();
    const markerCounts = new Map<string, number>();
    for (const code of codes) {
      const c = byCode.get(code)!;
      novaCounts[c.nova]++;
      for (const m of c.markers) if (m.group === 4 && m.type !== 'categories') markerCounts.set(m.tag, (markerCounts.get(m.tag) ?? 0) + 1);
    }
    let slug = slugify(tag.replace(/^en:/, ''));
    if (usedCategorySlugs.has(slug)) slug = `${slug}-${usedCategorySlugs.size}`;
    usedCategorySlugs.add(slug);
    categories.set(tag, {
      tag,
      slug,
      name: capitalize(cats.name(tag)!),
      parent: pageParent(tag),
      children: [],
      count: codes.length,
      novaCounts,
      codes,
      topMarkers: [...markerCounts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6),
    });
  }
  for (const c of categories.values()) if (c.parent) categories.get(c.parent)!.children.push(c.tag);
  for (const c of categories.values()) c.children.sort((a, b) => categories.get(b)!.count - categories.get(a)!.count);

  const breadcrumbOf = (tag: string | null): string[] => {
    const chain: string[] = [];
    for (let t = tag; t && !chain.includes(t); t = categories.get(t)!.parent) chain.unshift(t);
    return chain;
  };

  /** Most specific page category: deepest, then OFF's comparison category, then the smallest. */
  const primaryCategory = (c: Candidate): string | null => {
    const options = c.categories.filter((t) => pageTags.has(t));
    if (!options.length) return null;
    return options.sort(
      (a, b) =>
        cats.depth(b) - cats.depth(a) ||
        Number(b === c.comparedTo) - Number(a === c.comparedTo) ||
        categories.get(a)!.count - categories.get(b)!.count,
    )[0];
  };

  // --- products -------------------------------------------------------------
  const products: SiteProduct[] = selected.map((c) => {
    const category = primaryCategory(c);
    const breadcrumb = breadcrumbOf(category);
    const { tree, placed, count } = annotated.get(c.code)!;

    // Alternatives: less-processed products from the most specific category
    // (walking up the breadcrumb) that has at least two, else at least one.
    let alternatives: SiteProduct['alternatives'] = { category: null, codes: [] };
    if (c.nova > 1) {
      const scopes = [...breadcrumb].reverse();
      const options = scopes.map((tag) => ({
        category: tag,
        codes: categories
          .get(tag)!
          .codes.filter((code) => byCode.get(code)!.nova < c.nova)
          .sort((a, b) => byCode.get(a)!.nova - byCode.get(b)!.nova || rankIndex.get(a)! - rankIndex.get(b)!)
          .slice(0, opts.maxAlternatives),
      }));
      alternatives = options.find((o) => o.codes.length >= 2) ?? options.find((o) => o.codes.length >= 1) ?? alternatives;
    }

    // Related: neighbours in the category's processing order, for internal links.
    let related: string[] = [];
    let categoryRank: number | null = null;
    if (category) {
      const codes = categories.get(category)!.codes;
      const i = codes.indexOf(c.code);
      categoryRank = i + 1;
      const exclude = new Set([c.code, ...alternatives.codes]);
      const half = Math.ceil(opts.maxRelated / 2);
      const window = codes.slice(Math.max(0, i - half), i + half + 1 + opts.maxRelated);
      related = window.filter((code) => !exclude.has(code)).slice(0, opts.maxRelated);
    }

    return {
      code: c.code,
      slug: productSlug(c.name, c.brand, c.code),
      name: c.name,
      brand: c.brand,
      quantity: c.quantity,
      nova: c.nova,
      markers: c.markers,
      unplacedMarkers: [...new Set(c.markers.filter((m) => m.type !== 'categories' && !placed.has(m.tag)).map((m) => m.tag))],
      ingredientsText: c.ingredientsText,
      ingredients: tree,
      ingredientCount: count,
      additives: c.additives,
      nutriscore: c.nutriscore,
      countries: c.countries,
      image: c.image,
      lastModified: c.lastModified,
      category,
      breadcrumb,
      categoryRank,
      alternatives,
      related,
    };
  });

  // --- markers --------------------------------------------------------------
  const markerProducts = new Map<string, { group: NovaGroup; type: Marker['type']; codes: string[] }>();
  for (const c of selected) {
    for (const m of c.markers) {
      if (m.type === 'categories' || m.group < 3) continue;
      let entry = markerProducts.get(m.tag);
      if (!entry) markerProducts.set(m.tag, (entry = { group: m.group, type: m.type, codes: [] }));
      entry.group = Math.max(entry.group, m.group) as NovaGroup;
      if (!entry.codes.includes(c.code)) entry.codes.push(c.code);
    }
  }
  const productByCode = new Map(products.map((p) => [p.code, p]));
  const usedMarkerSlugs = new Set<string>();
  const markers: SiteMarker[] = [];
  for (const [tag, entry] of markerProducts) {
    if (entry.codes.length < opts.minMarkerPage) continue;
    const isAdditive = entry.type === 'additives';
    let name: string;
    let eNumber: string | null = null;
    let classes: string[] = [];
    let wikidata: string | null;
    if (isAdditive) {
      [eNumber, name] = splitAdditiveName(tax.additives.name(tag) ?? humanizeTag(tag));
      name = capitalize(name);
      eNumber ??= /^en:e\d/.test(tag) ? tag.slice(3).toUpperCase() : null;
      classes = (tax.additives.englishText(tag, 'additives_classes') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => tax.additivesClasses.has(s));
      wikidata = tax.additives.englishText(tag, 'wikidata');
    } else {
      name = capitalize(tax.ingredients.name(tag) ?? humanizeTag(tag));
      // Some ingredient markers are additive classes ("Emulsifier", "Colour").
      if (tax.additivesClasses.has(tag)) classes = [tag];
      wikidata = tax.ingredients.englishText(tag, 'wikidata');
    }
    let slug = slugify(eNumber ? `${eNumber} ${name}` : name) || slugify(tag.replace(/^en:/, ''));
    if (usedMarkerSlugs.has(slug)) slug = `${slug}-${slugify(tag.replace(/^en:/, ''))}`;
    usedMarkerSlugs.add(slug);

    const categoryCounts = new Map<string, number>();
    for (const code of entry.codes) {
      const cat = productByCode.get(code)!.category;
      if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
    markers.push({
      tag,
      slug,
      name,
      kind: isAdditive ? 'additive' : 'ingredient',
      group: entry.group,
      classes,
      eNumber,
      wikidata,
      count: entry.codes.length,
      codes: entry.codes.sort((a, b) => rankIndex.get(a)! - rankIndex.get(b)!),
      topCategories: [...categoryCounts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6),
    });
  }
  markers.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));

  // --- labels ---------------------------------------------------------------
  const labels: SiteLabels = { additives: {}, additiveClasses: {}, categories: {} };
  for (const c of selected) {
    for (const a of c.additives) labels.additives[a] ??= tax.additives.name(a) ?? humanizeTag(a);
    for (const m of c.markers) {
      if (m.type === 'categories') labels.categories[m.tag] ??= cats.name(m.tag) ?? humanizeTag(m.tag);
    }
  }
  const classTags = new Set<string>();
  for (const a of Object.keys(labels.additives)) {
    for (const cls of (tax.additives.englishText(a, 'additives_classes') ?? '').split(',')) classTags.add(cls.trim());
  }
  for (const m of markers) for (const cls of m.classes) classTags.add(cls);
  for (const cls of classTags) {
    const name = tax.additivesClasses.name(cls);
    if (name) labels.additiveClasses[cls] = { name: capitalize(name), description: tax.additivesClasses.englishText(cls, 'description') };
  }

  return { products, categories: [...categories.values()], markers, labels };
}

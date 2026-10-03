// Stage 2: choose the products for the site and build everything the Astro
// build reads: product pages, category pages, marker pages, alternatives.
//
//   node pipeline/select.ts [--work data/work] [--out data/site] [--taxonomies dir] [--source export|fixture]
//
// Reads data/work/candidates.jsonl, data/work/extract-stats.json and the
// taxonomies in data/work/taxonomies/ (see fetch-taxonomies.ts).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  BALANCE_SHARE,
  EXTRA_INGREDIENT_PARENTS,
  GENERIC_CATEGORIES,
  MAX_ALTERNATIVES,
  MAX_RELATED,
  MIN_CATEGORY_PAGE,
  MIN_MARKER_PAGE,
  PRIORITY_COUNTRIES,
  SITE_DATA_DIR,
  TARGET_PRODUCTS,
  WORK_DIR,
} from './config.ts';
import {
  buildSite,
  dedupe,
  hasImplausibleIngredients,
  ingredientAncestors,
  marketFirst,
  selectProducts,
  type BuildOptions,
} from './lib/build.ts';
import { loadTaxonomies } from './lib/taxonomy.ts';
import type { Candidate, NovaGroup, SiteMeta } from './lib/types.ts';

const { values: args } = parseArgs({
  options: {
    work: { type: 'string', default: WORK_DIR },
    out: { type: 'string', default: SITE_DATA_DIR },
    // defaults to <work>/taxonomies
    taxonomies: { type: 'string' },
    source: { type: 'string', default: 'export' },
    'export-date': { type: 'string' },
    target: { type: 'string', default: String(TARGET_PRODUCTS) },
    'min-category-page': { type: 'string', default: String(MIN_CATEGORY_PAGE) },
    'min-marker-page': { type: 'string', default: String(MIN_MARKER_PAGE) },
  },
});

const opts: BuildOptions = {
  compare: marketFirst(PRIORITY_COUNTRIES),
  target: Number(args.target),
  balanceShare: BALANCE_SHARE,
  minCategoryPage: Number(args['min-category-page']),
  minMarkerPage: Number(args['min-marker-page']),
  maxAlternatives: MAX_ALTERNATIVES,
  maxRelated: MAX_RELATED,
  generic: GENERIC_CATEGORIES,
  extraIngredientParents: EXTRA_INGREDIENT_PARENTS,
};

const started = Date.now();
const stats = JSON.parse(await readFile(`${args.work}/extract-stats.json`, 'utf8'));
const pool: Candidate[] = (await readFile(`${args.work}/candidates.jsonl`, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const tax = await loadTaxonomies(args.taxonomies ?? `${args.work}/taxonomies`);

const ancestorsOf = ingredientAncestors(tax.ingredients, opts.extraIngredientParents);
const plausible = pool.filter((c) => !hasImplausibleIngredients(c, ancestorsOf));
const unique = dedupe(plausible.sort(opts.compare));
const { selected, balanced } = selectProducts(unique, tax.categories, opts);
const site = buildSite(selected, tax, opts);

const novaCounts: Record<NovaGroup, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const p of site.products) novaCounts[p.nova]++;

const meta: SiteMeta = {
  source: args.source === 'fixture' ? 'fixture' : 'export',
  input: stats.input,
  exportDate: args['export-date'] || null,
  generatedAt: new Date().toISOString(),
  funnel: {
    linesRead: stats.linesRead,
    parseErrors: stats.parseErrors,
    rejected: stats.rejected,
    eligible: stats.eligible,
    pooled: stats.pooled,
    implausible: pool.length - plausible.length,
    afterDedupe: unique.length,
    selected: site.products.length,
    selectedForBalance: balanced,
  },
  novaCounts,
};

await mkdir(args.out, { recursive: true });
const write = (name: string, data: unknown) => writeFile(`${args.out}/${name}.json`, JSON.stringify(data));
await Promise.all([
  write('meta', meta),
  write('products', site.products),
  write('categories', site.categories),
  write('markers', site.markers),
  write('labels', site.labels),
]);

const withAlternatives = site.products.filter((p) => p.alternatives.codes.length).length;
const needAlternatives = site.products.filter((p) => p.nova > 1).length;
const withCategory = site.products.filter((p) => p.category).length;
console.error(
  [
    `Selected ${site.products.length} of ${unique.length} unique candidates (${balanced} pulled in for balance)`,
    `NOVA groups: ${JSON.stringify(novaCounts)}`,
    `Category pages: ${site.categories.length}; products with a category page: ${withCategory}`,
    `Marker pages: ${site.markers.length}`,
    `NOVA 2-4 products with alternatives: ${withAlternatives} of ${needAlternatives}`,
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  ].join('\n'),
);

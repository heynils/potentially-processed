// Stage 2: choose the products for the site and build everything the Astro
// build reads: product pages, category pages, marker pages, alternatives.
//
//   node pipeline/select.ts [--work data/work] [--out data/site] [--taxonomies dir]
//                           [--source export|fixture] [--published data/published.txt]
//
// Reads data/work/candidates.jsonl, data/work/extract-stats.json and the
// taxonomies in data/work/taxonomies/ (see fetch-taxonomies.ts). With
// --published (see fetch-published.ts), products already on the live site
// are kept first and renamed ones get redirects (data/site/redirects.json).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  BALANCE_SHARE,
  EXTRA_INGREDIENT_PARENTS,
  GENERIC_CATEGORIES,
  MARKET_QUOTAS,
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
  parsePublished,
  publishedFirst,
  selectProducts,
  slugRedirects,
  type BuildOptions,
} from './lib/build.ts';
import { inMarket, marketFirst } from './lib/markets.ts';
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
    published: { type: 'string' },
    target: { type: 'string', default: String(TARGET_PRODUCTS) },
    'min-category-page': { type: 'string', default: String(MIN_CATEGORY_PAGE) },
    'min-marker-page': { type: 'string', default: String(MIN_MARKER_PAGE) },
  },
});

const opts: BuildOptions = {
  compare: marketFirst(PRIORITY_COUNTRIES),
  target: Number(args.target),
  quotas: MARKET_QUOTAS,
  marketCountries: PRIORITY_COUNTRIES,
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

const publishedPaths =
  args.published && existsSync(args.published) ? (await readFile(args.published, 'utf8')).split('\n').filter(Boolean) : [];
const published = parsePublished(publishedPaths);

const ancestorsOf = ingredientAncestors(tax.ingredients, opts.extraIngredientParents);
const plausible = pool.filter((c) => !hasImplausibleIngredients(c, ancestorsOf));
// Published products go first in the pool so they keep their place (and URL).
const unique = dedupe(plausible.sort(publishedFirst(opts.compare, new Set(published.keys()))));
const { selected, balanced } = selectProducts(unique, tax.categories, opts);
const site = buildSite(selected, tax, opts);
const redirects = slugRedirects(published, site.products);
const keptCount = site.products.filter((p) => published.has(p.code)).length;

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
    markets: MARKET_QUOTAS.map((m) => ({
      ...m,
      eligible: stats.eligibleByMarket?.[m.name] ?? 0,
      selected: selected.filter((c) => inMarket(m, c)).length,
    })),
  },
  continuity: {
    published: published.size,
    kept: keptCount,
    renamed: Object.keys(redirects).length,
    dropped: published.size - keptCount,
  },
  novaCounts,
  countries: [...PRIORITY_COUNTRIES]
    .map((tag) => ({ tag, products: site.products.filter((p) => p.countries.includes(tag)).length }))
    .sort((a, b) => b.products - a.products),
};

await mkdir(args.out, { recursive: true });
const write = (name: string, data: unknown) => writeFile(`${args.out}/${name}.json`, JSON.stringify(data));
await Promise.all([
  write('meta', meta),
  write('products', site.products),
  write('categories', site.categories),
  write('markers', site.markers),
  write('labels', site.labels),
  write('redirects', redirects),
]);

const withAlternatives = site.products.filter((p) => p.alternatives.codes.length).length;
const needAlternatives = site.products.filter((p) => p.nova > 1).length;
const withCategory = site.products.filter((p) => p.category).length;
console.error(
  [
    `Selected ${site.products.length} of ${unique.length} unique candidates (${balanced} pulled in for balance)`,
    ...meta.funnel.markets.map((m) => `${m.name}: ${m.selected} selected of ${m.eligible} eligible`),
    `NOVA groups: ${JSON.stringify(novaCounts)}`,
    `Category pages: ${site.categories.length}; products with a category page: ${withCategory}`,
    `Marker pages: ${site.markers.length} (${site.markers.filter((m) => m.group === null).length} additives that are not markers)`,
    `Previously published products: ${published.size}; kept ${keptCount}, renamed ${Object.keys(redirects).length}, dropped ${published.size - keptCount}`,
    `NOVA 2-4 products with alternatives: ${withAlternatives} of ${needAlternatives}`,
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  ].join('\n'),
);

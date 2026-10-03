import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotateIngredients, buildSite, dedupe, ingredientAncestors, selectProducts, splitAdditiveName, type BuildOptions } from '../lib/build.ts';
import { productSlug, slugify } from '../lib/slug.ts';
import { candidate, testTaxonomies } from './helpers.ts';

const opts: BuildOptions = {
  target: 10,
  balanceShare: 0.2,
  minCategoryPage: 2,
  minMarkerPage: 1,
  maxAlternatives: 4,
  maxRelated: 6,
  generic: new Set(['en:snacks']),
  extraIngredientParents: { 'en:modified-starch': ['en:e14xx'] },
};

test('markers are matched through the taxonomy, not by id', () => {
  const tax = testTaxonomies();
  const ancestorsOf = ingredientAncestors(tax.ingredients, opts.extraIngredientParents);
  const { tree, placed, count } = annotateIngredients(
    [
      { id: 'en:sugar', text: 'Sugar' },
      { id: 'en:whey-powder', text: 'Whey powder', children: [{ id: 'en:whey-powder', text: 'from milk' }] },
      { id: 'en:emulsifier', text: 'Emulsifier', children: [{ id: 'en:soya-lecithin', text: 'soya lecithin' }] },
      { id: 'en:e440a', text: 'pectin' },
      { id: 'en:modified-starch', text: 'modified starch' },
    ],
    [
      { group: 4, type: 'ingredients', tag: 'en:whey' },
      { group: 4, type: 'additives', tag: 'en:e322' },
      { group: 4, type: 'ingredients', tag: 'en:emulsifier' },
      { group: 4, type: 'additives', tag: 'en:e440' },
      { group: 4, type: 'additives', tag: 'en:e14xx' },
      { group: 4, type: 'additives', tag: 'en:e999' },
      { group: 3, type: 'ingredients', tag: 'en:sugar' },
      { group: 3, type: 'categories', tag: 'en:sweet-snacks' },
    ],
    ancestorsOf,
  );
  assert.equal(count, 7);
  assert.deepEqual(tree[0], { text: 'Sugar', markerTags: ['en:sugar'], markerGroup: 3 });
  assert.deepEqual(tree[1].markerTags, ['en:whey'], 'parent tag matches whey-powder');
  assert.equal(tree[1].children?.[0].markerTags, undefined, 'not repeated on the child');
  assert.deepEqual(tree[2].children?.[0].markerTags, ['en:e322'], 'soya lecithin -> e322i -> e322');
  assert.deepEqual(tree[3].markerTags, ['en:e440'], 'variant e440a -> e440');
  assert.deepEqual(tree[4].markerTags, ['en:e14xx'], 'alias from config');
  assert.equal(placed.has('en:e999'), false);
  assert.equal(placed.has('en:sweet-snacks'), false, 'category markers are never placed');
});

test('dedupe keeps the first of each brand + name', () => {
  const out = dedupe([
    candidate({ code: '1', name: 'Digestives', brand: "McVitie's" }),
    candidate({ code: '2', name: 'DIGESTIVES', brand: 'McVities' }),
    candidate({ code: '3', name: 'Digestives', brand: 'Tesco' }),
  ]);
  assert.deepEqual(out.map((c) => c.code), ['1', '3']);
});

test('selection pulls in less-processed products so popular ones have alternatives', () => {
  const tax = testTaxonomies();
  // 10 popular ultra-processed biscuits, then a less popular group-1 and group-3 biscuit.
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => candidate({ code: `u${i}`, scans: 1000 - i, nova: 4 })),
    candidate({ code: 'plain', scans: 5, nova: 1 }),
    candidate({ code: 'simple', scans: 4, nova: 3 }),
    candidate({ code: 'other', scans: 3, nova: 4, categories: ['en:cereals', 'en:breakfast-cereals'] }),
  ];
  const { selected, balanced } = selectProducts(pool, tax.categories, opts);
  const codes = selected.map((c) => c.code);
  assert.equal(selected.length, 10);
  assert.equal(balanced, 2);
  assert.ok(codes.includes('plain') && codes.includes('simple'));
  assert.ok(!codes.includes('other'));
});

test('buildSite: categories, ranking, alternatives and markers', () => {
  const tax = testTaxonomies();
  const e322 = { group: 4 as const, type: 'additives' as const, tag: 'en:e322' };
  const selected = [
    candidate({ code: '1', name: 'Choc Biscuit', nova: 4, markers: [e322], additives: ['en:e322'], categories: ['en:snacks', 'en:sweet-snacks', 'en:biscuits', 'en:chocolate-biscuits'] }),
    candidate({ code: '2', name: 'Choc Biscuit Lite', nova: 4, markers: [e322], categories: ['en:snacks', 'en:sweet-snacks', 'en:biscuits', 'en:chocolate-biscuits'] }),
    candidate({ code: '3', name: 'Oat Biscuit', nova: 3, scans: 1 }),
    candidate({ code: '4', name: 'Plain Oatcake', nova: 1, scans: 1 }),
  ];
  const site = buildSite(selected, tax, opts);
  const tags = site.categories.map((c) => c.tag).sort();
  assert.deepEqual(tags, ['en:biscuits', 'en:chocolate-biscuits', 'en:sweet-snacks'], 'generic en:snacks excluded');

  const biscuits = site.categories.find((c) => c.tag === 'en:biscuits')!;
  assert.deepEqual(biscuits.codes, ['4', '3', '2', '1'], 'least processed first; fewer additives breaks the tie');
  assert.equal(biscuits.parent, 'en:sweet-snacks');
  assert.deepEqual(biscuits.novaCounts, { 1: 1, 2: 0, 3: 1, 4: 2 });

  const p1 = site.products.find((p) => p.code === '1')!;
  assert.equal(p1.category, 'en:chocolate-biscuits', 'most specific category with a page');
  assert.deepEqual(p1.breadcrumb, ['en:sweet-snacks', 'en:biscuits', 'en:chocolate-biscuits']);
  assert.equal(p1.alternatives.category, 'en:biscuits', 'climbs to the parent: no lower group among chocolate biscuits');
  assert.deepEqual(p1.alternatives.codes, ['4', '3']);
  assert.equal(p1.slug, 'brand-choc-biscuit-1');

  const p4 = site.products.find((p) => p.code === '4')!;
  assert.deepEqual(p4.alternatives.codes, [], 'group 1 needs no alternatives');

  const m = site.markers.find((x) => x.tag === 'en:e322')!;
  assert.equal(m.name, 'Lecithins');
  assert.equal(m.eNumber, 'E322');
  assert.equal(m.slug, 'e322-lecithins');
  assert.deepEqual(m.classes, ['en:emulsifier']);
  assert.equal(site.labels.additiveClasses['en:emulsifier'].name, 'Emulsifier');
});

test('splitAdditiveName and slugs', () => {
  assert.deepEqual(splitAdditiveName('E322 - Lecithins'), ['E322', 'Lecithins']);
  assert.deepEqual(splitAdditiveName('E150d - Sulphite ammonia caramel'), ['E150d', 'Sulphite ammonia caramel']);
  assert.deepEqual(splitAdditiveName('Something'), [null, 'Something']);
  assert.equal(slugify('Crème Fraîche & Co.'), 'creme-fraiche-and-co');
  assert.equal(productSlug("Heinz Tomato Ketchup", 'Heinz', '123'), 'heinz-tomato-ketchup-123');
  assert.equal(productSlug('Tomato Ketchup', 'Heinz', '123'), 'heinz-tomato-ketchup-123');
});

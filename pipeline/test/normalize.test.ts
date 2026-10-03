import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barcodePath, compareRank, frontImage, normalize, parseMarkers, parseNova, scanYear, tidyName } from '../lib/normalize.ts';
import { candidate } from './helpers.ts';

const LANGUAGES = new Set(['en', 'sv']);

// Trimmed from a real record in the OFF export (fields as they appear there).
const raw = () => ({
  code: '0000159487776',
  lang: 'en',
  product_name: 'MAGIC STARS CHOCOLATES',
  brands: 'Cadbury,Mondelez',
  nova_group: 4,
  nova_groups_markers: {
    '3': [['ingredients', 'en:sugar'], ['ingredients', 'en:milk-powder']],
    '4': [['additives', 'en:e322'], ['ingredients', 'en:emulsifier'], ['ingredients', 'en:whey']],
  },
  ingredients_text_en: 'SUGAR, _MILK_ FAT, EMULSIFIER (SOYA LECITHIN)',
  ingredients: [
    { id: 'en:sugar', text: 'SUGAR', percent_estimate: 50 },
    { id: 'en:milkfat', text: '_MILK_ FAT', percent: '12' },
    { id: 'en:emulsifier', text: 'EMULSIFIER', ingredients: [{ id: 'en:soya-lecithin', text: 'SOYA LECITHIN' }] },
  ],
  additives_tags: ['en:e322', 'en:e322i'],
  categories_hierarchy: ['en:snacks', 'en:sweet-snacks', 'en:Plain Flour', 'en:chocolates'],
  compared_to_category: 'en:chocolates',
  countries_tags: ['en:united-kingdom'],
  nutriscore_grade: 'e',
  images: { selected: { front: { en: { rev: '4', sizes: { '400': { w: 300, h: 400 } } } } } },
  popularity_key: 24990000072,
  unique_scans_n: 60,
  completeness: 1.0875,
  last_modified_t: 1784313770,
});

test('normalizes a real-shaped record', () => {
  const r = normalize(raw(), LANGUAGES);
  assert.ok(r.ok);
  const c = r.candidate;
  assert.equal(c.lang, 'en');
  assert.equal(c.name, 'Magic Stars Chocolates');
  assert.equal(c.brand, 'Cadbury');
  assert.equal(c.nova, 4);
  assert.equal(c.completeness, 1, 'completeness is clamped; the export has values above 1');
  assert.equal(c.ingredientsText, 'SUGAR, MILK FAT, EMULSIFIER (SOYA LECITHIN)', 'allergen underscores removed');
  assert.deepEqual(c.categories, ['en:snacks', 'en:sweet-snacks', 'en:chocolates'], 'free-text tags dropped');
  assert.equal(c.comparedTo, 'en:chocolates');
  assert.equal(c.ingredients[1].percent, 12, 'printed percent kept');
  assert.equal(c.ingredients[0].percent, undefined, 'estimated percent dropped');
  assert.equal(c.ingredients[2].children?.[0].id, 'en:soya-lecithin');
  assert.equal(c.scans, 60);
  assert.equal(c.markers[0].group, 4, 'strongest markers first');
});

test('rejects records with a reason', () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ nova_group: null }, 'no-nova-group'],
    [{ lang: 'fr' }, 'other-language'],
    [{ ingredients_lc: 'fr' }, 'other-language'],
    [{ obsolete: 'on' }, 'obsolete'],
    [{ code: '12ab' }, 'bad-code'],
    [{ product_name: '', product_name_en: '' }, 'no-name'],
    [{ ingredients: [] }, 'no-ingredients'],
  ];
  for (const [patch, reason] of cases) {
    const r = normalize({ ...raw(), ...patch }, LANGUAGES);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, reason);
  }
});

// Shaped like real Swedish records in the export (ICA, Sweet Baby Ray's, Clif Bar).
test('takes name and ingredients in the language OFF parsed the ingredients in', () => {
  const swedish = normalize(
    {
      ...raw(),
      lang: 'sv',
      ingredients_lc: 'sv',
      product_name: 'ÄPPELMOS',
      product_name_sv: 'ÄPPELMOS',
      product_name_en: 'Apple sauce',
      ingredients_text_sv: 'Äpple 90%, socker',
      ingredients_text_en: 'Apple 90%, sugar',
      countries_tags: ['en:sweden'],
      images: { front_sv: { rev: '7', sizes: { '400': { w: 300, h: 400 } } }, front_en: { rev: '2', sizes: { '400': { w: 300, h: 400 } } } },
    },
    LANGUAGES,
  );
  assert.ok(swedish.ok);
  assert.equal(swedish.candidate.lang, 'sv');
  assert.equal(swedish.candidate.name, 'Äppelmos', 'Swedish name, all-caps tamed');
  assert.equal(swedish.candidate.ingredientsText, 'Äpple 90%, socker');
  assert.ok(swedish.candidate.image?.url.includes('/front_sv.7.'), 'Swedish pack photo');

  // English ingredients parsed on a German-labelled product: shown in English.
  const german = normalize(
    { ...raw(), lang: 'de', ingredients_lc: 'en', product_name: 'Erdnussbutter', product_name_en: 'Crunchy Peanut Butter' },
    LANGUAGES,
  );
  assert.ok(german.ok);
  assert.equal(german.candidate.lang, 'en');
  assert.equal(german.candidate.name, 'Crunchy Peanut Butter');

  // The pack's main-language name is only used when it is in the shown language.
  const noEnglishName = normalize({ ...raw(), lang: 'de', ingredients_lc: 'en', product_name: 'Erdnussbutter', product_name_en: '' }, LANGUAGES);
  assert.equal(!noEnglishName.ok && noEnglishName.reason, 'no-name');

  // English label, but OFF parsed the French ingredient list: the tree would be French.
  const frenchTree = normalize({ ...raw(), ingredients_lc: 'fr' }, LANGUAGES);
  assert.equal(!frenchTree.ok && frenchTree.reason, 'other-language');
  assert.equal(normalize(raw(), new Set(['en'])).ok, true);
  assert.equal(normalize({ ...raw(), lang: 'sv', ingredients_lc: 'sv', product_name_sv: 'Kaviar' }, new Set(['en'])).ok, false);
});

test('a product without a category is valid; the pool decides whether it is wanted', () => {
  const r = normalize({ ...raw(), categories_hierarchy: ['en:null', 'sv:okänd'] }, LANGUAGES);
  assert.ok(r.ok);
  assert.deepEqual(r.candidate.categories, []);
});

test('categories fall back to categories_tags when the hierarchy is empty', () => {
  // Pågen Gifflar and Bregott look like this in the export.
  const r = normalize({ ...raw(), categories_hierarchy: [], categories_tags: ['en:snacks', 'en:sweet-snacks', 'sv:gifflar', 'en:biscuits'] }, LANGUAGES);
  assert.ok(r.ok);
  assert.deepEqual(r.candidate.categories, ['en:snacks', 'en:sweet-snacks', 'en:biscuits']);
});

test('parseNova accepts ints and numeric strings only in 1..4', () => {
  assert.equal(parseNova(3), 3);
  assert.equal(parseNova('4'), 4);
  assert.equal(parseNova(5), null);
  assert.equal(parseNova('x'), null);
  assert.equal(parseNova(undefined), null);
});

test('parseMarkers ignores malformed entries and duplicates', () => {
  const m = parseMarkers({ '4': [['additives', 'en:e322'], ['additives', 'en:e322'], ['bogus', 'en:x'], 'nope'], '9': [['ingredients', 'en:y']] });
  assert.deepEqual(m, [{ group: 4, type: 'additives', tag: 'en:e322' }]);
});

test('barcodePath follows the OFF image folder layout', () => {
  assert.equal(barcodePath('3017620422003'), '301/762/042/2003');
  assert.equal(barcodePath('00053327'), '00053327');
  assert.equal(barcodePath('123456789012'), '012/345/678/9012', 'padded to 13 digits');
});

test('frontImage handles the legacy and the newer images schema', () => {
  const legacy = frontImage('3017620422003', { front_en: { rev: '3', sizes: { '400': { w: 300, h: 400 } } } }, 'en');
  assert.equal(legacy?.url, 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.3.400.jpg');
  const selected = frontImage('3017620422003', { selected: { front: { fr: { rev: 4, sizes: { '400': { w: 301, h: 400 } } } } } }, 'en');
  assert.equal(selected?.url.endsWith('/front_fr.4.400.jpg'), true, 'falls back to another language');
  assert.equal(frontImage('3017620422003', { selected: { ingredients: {} } }, 'en'), null);
});

test('tidyName only touches all-caps names', () => {
  assert.equal(tidyName('CHAMOMILE HERBAL TEA'), 'Chamomile Herbal Tea');
  assert.equal(tidyName("Lagg's, herbal tea"), "Lagg's, herbal tea");
  assert.equal(tidyName('SMÖRGÅSGURKA ÖRTER'), 'Smörgåsgurka Örter');
  assert.equal(tidyName('Kalles Kaviar'), 'Kalles Kaviar');
});

test('ranking: recent scan year first, then distinct scanners', () => {
  assert.equal(scanYear(24999990054), 24);
  assert.equal(scanYear(12), 0);
  const nicheTopTier = candidate({ code: '1', popularity: 24999990054, scans: 54 });
  const staple = candidate({ code: '2', popularity: 24950000048, scans: 900 });
  const oldButBig = candidate({ code: '3', popularity: 23900000006, scans: 5000 });
  const sorted = [nicheTopTier, oldButBig, staple].sort(compareRank).map((c) => c.code);
  assert.deepEqual(sorted, ['2', '1', '3']);
});

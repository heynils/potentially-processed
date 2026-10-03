// Builds the committed development sample (pipeline/fixtures/) from a real
// export and a real select run, so `npm run data:sample` gives a realistic
// site in seconds with no network access.
//
//   node pipeline/make-fixture.ts --export data/work/export.jsonl.gz
//
// It picks products from a few categories (across all NOVA groups, so
// alternatives work), adds a handful of records the filters must reject,
// trims every record to the fields the pipeline reads, and trims the
// taxonomies to the tags those records use.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { LANGUAGES, MARKET_QUOTAS, SITE_DATA_DIR, WORK_DIR } from './config.ts';
import { inMarket } from './lib/markets.ts';
import { ingredientsLanguage } from './lib/normalize.ts';
import { openInput, splitLines } from './lib/stream.ts';
import type { SiteCategory, SiteProduct } from './lib/types.ts';
import type { TaxonomyEntry } from './lib/taxonomy.ts';

const { values: args } = parseArgs({
  options: {
    export: { type: 'string', default: `${WORK_DIR}/export.jsonl.gz` },
    site: { type: 'string', default: SITE_DATA_DIR },
    taxonomies: { type: 'string', default: `${WORK_DIR}/taxonomies` },
    out: { type: 'string', default: 'pipeline/fixtures' },
  },
});

const CATEGORIES = [
  'en:breakfast-cereals',
  'en:ketchup',
  'en:peanut-butters',
  'en:crisps',
  'en:yogurts',
  'en:breads',
  'en:chocolate-spreads',
  'en:biscuits',
];
const PER_CATEGORY = 40;
/** Extra products per category from each quota market (Sweden), so the sample covers them too. */
const PER_CATEGORY_MARKET = 8;
const REJECTS_PER_REASON = 4;

// Everything normalize() reads, plus the fields shown in the funnel.
const KEEP = [
  'code',
  'lang',
  'ingredients_lc',
  'obsolete',
  'product_name',
  ...[...LANGUAGES].map((l) => `product_name_${l}`),
  'brands',
  'quantity',
  'nova_group',
  'nova_groups_markers',
  'ingredients_text',
  ...[...LANGUAGES].map((l) => `ingredients_text_${l}`),
  'ingredients',
  'additives_tags',
  'categories_hierarchy',
  'categories_tags',
  'compared_to_category',
  'countries_tags',
  'nutriscore_grade',
  'images',
  'popularity_key',
  'unique_scans_n',
  'completeness',
  'last_modified_t',
];

function trimIngredients(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((n: Record<string, unknown>) => {
    const out: Record<string, unknown> = { id: n.id, text: n.text };
    if (n.percent !== undefined) out.percent = n.percent;
    if (n.ingredients) out.ingredients = trimIngredients(n.ingredients);
    return out;
  });
}

function trimImages(images: unknown): unknown {
  if (!images || typeof images !== 'object') return undefined;
  const imgs = images as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const front = (imgs.selected as Record<string, unknown> | undefined)?.front;
  if (front) out.selected = { front };
  for (const [k, v] of Object.entries(imgs)) if (/^front_[a-z]{2}$/.test(k)) out[k] = v;
  return out;
}

function trim(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEEP) if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
  out.ingredients = trimIngredients(raw.ingredients);
  out.images = trimImages(raw.images);
  return out;
}

// --- choose products ----------------------------------------------------------
const products: SiteProduct[] = JSON.parse(await readFile(`${args.site}/products.json`, 'utf8'));
const categories: SiteCategory[] = JSON.parse(await readFile(`${args.site}/categories.json`, 'utf8'));
const byCode = new Map(products.map((p) => [p.code, p]));
const wanted = new Set<string>();
for (const tag of CATEGORIES) {
  const c = categories.find((x) => x.tag === tag);
  if (!c) {
    console.error(`(no category page for ${tag}; skipped)`);
    continue;
  }
  // Spread across NOVA groups: take from both ends of the processing order.
  const picked: string[] = [];
  for (let i = 0, j = c.codes.length - 1; i <= j && picked.length < PER_CATEGORY; i++, j--) {
    picked.push(c.codes[i]);
    if (j !== i) picked.push(c.codes[j]);
  }
  for (const code of picked) wanted.add(code);
  for (const m of MARKET_QUOTAS) {
    const local = c.codes.filter((code) => byCode.has(code) && inMarket(m, byCode.get(code)!));
    for (const code of local.slice(0, PER_CATEGORY_MARKET / 2)) wanted.add(code);
    for (const code of local.slice(-PER_CATEGORY_MARKET / 2)) wanted.add(code);
  }
}
// Pull in the alternatives these products point to, so their pages are complete.
for (const code of [...wanted]) for (const alt of byCode.get(code)?.alternatives.codes ?? []) wanted.add(alt);
console.error(`Picked ${wanted.size} products`);

// --- stream the export --------------------------------------------------------
// `_id` is the top-level barcode. ("code" also occurs inside nested objects,
// and key order in the export is arbitrary, so it can't be found by bytes.)
const ID = Buffer.from('"_id":"');
const kept: Record<string, unknown>[] = [];
const found = new Set<string>();
const rejects = new Map<string, number>();
let seen = 0;
for await (const line of splitLines(await openInput(args.export))) {
  if (++seen % 500_000 === 0) console.error(`  ${seen.toLocaleString('en')} lines, kept ${kept.length}`);
  const at = line.indexOf(ID);
  if (at === -1) continue;
  const end = line.indexOf(0x22, at + ID.length);
  const code = line.subarray(at + ID.length, end).toString();
  const want = wanted.has(code);
  // A few real records each filter should reject, for the funnel.
  const sampleReject = !want && seen % 9973 === 0;
  if (!want && !sampleReject) continue;
  const raw = JSON.parse(line.toString('utf8'));
  if (want) {
    kept.push(trim(raw));
    found.add(code);
  }
  else {
    const reason = !raw.nova_group ? 'no-nova' : !LANGUAGES.has(ingredientsLanguage(raw)) ? 'other-language' : 'other';
    if ((rejects.get(reason) ?? 0) < REJECTS_PER_REASON) {
      rejects.set(reason, (rejects.get(reason) ?? 0) + 1);
      kept.push(trim(raw));
    }
  }
  if (found.size === wanted.size && [...rejects.values()].reduce((a, b) => a + b, 0) >= REJECTS_PER_REASON * 3) break;
}
console.error(`Kept ${kept.length} records (${found.size} of ${wanted.size} wanted products found)`);

await mkdir(`${args.out}/taxonomies`, { recursive: true });
await writeFile(`${args.out}/sample.jsonl.gz`, gzipSync(kept.map((r) => JSON.stringify(r)).join('\n') + '\n', { level: 9 }));

// --- trim taxonomies to the tags the sample uses -------------------------------
const used = new Set<string>();
const walk = (list: unknown) => {
  if (!Array.isArray(list)) return;
  for (const n of list as Record<string, unknown>[]) {
    if (typeof n.id === 'string') used.add(n.id);
    walk(n.ingredients);
  }
};
for (const r of kept) {
  for (const t of (r.categories_hierarchy as string[]) ?? []) used.add(t);
  for (const t of (r.additives_tags as string[]) ?? []) used.add(t);
  for (const list of Object.values((r.nova_groups_markers as Record<string, [string, string][]>) ?? {})) for (const [, t] of list) used.add(t);
  walk(r.ingredients);
}

for (const name of ['categories', 'ingredients', 'additives', 'additives_classes']) {
  const full: Record<string, TaxonomyEntry> = JSON.parse(await readFile(`${args.taxonomies}/${name}.json`, 'utf8'));
  const keep = new Set<string>();
  const add = (tag: string) => {
    if (keep.has(tag) || !(tag in full)) return;
    keep.add(tag);
    for (const p of full[tag].parents ?? []) add(p);
  };
  if (name === 'additives_classes') {
    const additives: Record<string, TaxonomyEntry> = JSON.parse(await readFile(`${args.taxonomies}/additives.json`, 'utf8'));
    for (const a of used) for (const c of (additives[a]?.additives_classes?.en ?? '').split(',')) add(c.trim());
    for (const t of used) add(t); // ingredient markers that are class names ("en:emulsifier")
  } else {
    for (const t of used) add(t);
  }
  const en = (v?: Record<string, string>) => (v?.en ? { en: v.en } : undefined);
  const trimmed = Object.fromEntries(
    [...keep].sort().map((t) => {
      const e = full[t];
      return [
        t,
        Object.fromEntries(
          Object.entries({
            name: en(e.name),
            parents: e.parents?.filter((p) => keep.has(p)),
            description: en(e.description),
            additives_classes: en(e.additives_classes),
            e_number: en(e.e_number),
            wikidata: en(e.wikidata),
          }).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
        ),
      ];
    }),
  );
  await writeFile(`${args.out}/taxonomies/${name}.json`, JSON.stringify(trimmed) + '\n');
  console.error(`${name}: kept ${keep.size} of ${Object.keys(full).length}`);
}

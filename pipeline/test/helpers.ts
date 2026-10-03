import type { Candidate } from '../lib/types.ts';
import { Taxonomy, type Taxonomies } from '../lib/taxonomy.ts';

/** A minimal Candidate; override what a test cares about. */
export function candidate(overrides: Partial<Candidate> & { code: string }): Candidate {
  return {
    lang: 'en',
    name: `Product ${overrides.code}`,
    brand: 'Brand',
    quantity: null,
    nova: 4,
    markers: [],
    ingredientsText: 'stuff',
    ingredients: [{ id: 'en:stuff', text: 'stuff' }],
    additives: [],
    categories: ['en:snacks', 'en:sweet-snacks', 'en:biscuits'],
    comparedTo: null,
    countries: ['en:united-kingdom'],
    nutriscore: null,
    image: null,
    popularity: 24950000000,
    scans: 10,
    completeness: 0.8,
    lastModified: 1_700_000_000,
    ...overrides,
  };
}

const named = (entries: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(entries).map(([tag, parents]) => [
      tag,
      { name: { en: tag.replace(/^en:/, '').replace(/-/g, ' ') }, ...(parents.length ? { parents } : {}) },
    ]),
  );

/** Small taxonomies shaped like OFF's, with the relationships seen in real data. */
export function testTaxonomies(): Taxonomies {
  return {
    categories: new Taxonomy(
      named({
        'en:snacks': [],
        'en:sweet-snacks': ['en:snacks'],
        'en:biscuits': ['en:sweet-snacks'],
        'en:chocolate-biscuits': ['en:biscuits'],
        'en:cereals': [],
        'en:breakfast-cereals': ['en:cereals'],
      }),
    ),
    ingredients: new Taxonomy(
      named({
        'en:whey': [],
        'en:whey-powder': ['en:whey'],
        'en:e322': [],
        'en:e322i': ['en:e322'],
        'en:soya-lecithin': ['en:e322i'],
        'en:e440a': [],
        'en:emulsifier': [],
        'en:sugar': [],
        'en:modified-starch': [],
      }),
    ),
    additives: new Taxonomy({
      'en:e322': { name: { en: 'E322 - Lecithins' }, additives_classes: { en: 'en:emulsifier' } },
      'en:e471': { name: { en: 'E471 - Mono- and diglycerides of fatty acids' }, additives_classes: { en: 'en:emulsifier' } },
    }),
    additivesClasses: new Taxonomy({
      'en:emulsifier': { name: { en: 'Emulsifier' }, description: { en: 'Emulsifiers make it possible to form a homogenous mixture.' } },
    }),
  };
}

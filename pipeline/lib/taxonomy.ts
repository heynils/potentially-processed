import { readFile } from 'node:fs/promises';

/**
 * A thin wrapper over one of OFF's taxonomy JSON files
 * (static.openfoodfacts.org/data/taxonomies/<name>.json).
 *
 * A taxonomy is a directed acyclic graph of tags: "en:soya-lecithin" has
 * parent "en:e322i", which has parent "en:e322". OFF reports NOVA markers at
 * whatever level of that graph carries the NOVA property, so matching a
 * marker to an ingredient means asking "is the marker an ancestor of (or
 * equal to) this ingredient?", not comparing ids.
 */
export interface TaxonomyEntry {
  name?: Record<string, string>;
  parents?: string[];
  description?: Record<string, string>;
  additives_classes?: Record<string, string>;
  e_number?: Record<string, string>;
  wikidata?: Record<string, string>;
}

export class Taxonomy {
  private readonly entries: Record<string, TaxonomyEntry>;
  private readonly ancestorCache = new Map<string, Set<string>>();
  private readonly depthCache = new Map<string, number>();

  constructor(entries: Record<string, TaxonomyEntry>) {
    this.entries = entries;
  }

  static async load(path: string): Promise<Taxonomy> {
    return new Taxonomy(JSON.parse(await readFile(path, 'utf8')));
  }

  has(tag: string): boolean {
    return tag in this.entries;
  }

  get(tag: string): TaxonomyEntry | undefined {
    return this.entries[tag];
  }

  /** English name, or null if the taxonomy has none. */
  name(tag: string): string | null {
    return this.entries[tag]?.name?.en?.trim() || null;
  }

  englishText(tag: string, field: 'description' | 'additives_classes' | 'e_number' | 'wikidata'): string | null {
    return this.entries[tag]?.[field]?.en?.trim() || null;
  }

  parents(tag: string): string[] {
    return (this.entries[tag]?.parents ?? []).filter((p) => p in this.entries);
  }

  /** The tag itself plus every ancestor. Unknown tags map to just themselves. */
  ancestors(tag: string): Set<string> {
    const cached = this.ancestorCache.get(tag);
    if (cached) return cached;
    const out = new Set<string>([tag]);
    this.ancestorCache.set(tag, out); // guards against cycles in hand-edited taxonomies
    for (const p of this.parents(tag)) for (const a of this.ancestors(p)) out.add(a);
    return out;
  }

  /** Length of the longest path to a root; roots are 0. Used to find "most specific". */
  depth(tag: string): number {
    const cached = this.depthCache.get(tag);
    if (cached !== undefined) return cached;
    this.depthCache.set(tag, 0);
    const parents = this.parents(tag);
    const d = parents.length ? 1 + Math.max(...parents.map((p) => this.depth(p))) : 0;
    this.depthCache.set(tag, d);
    return d;
  }
}

/** Fallback label for tags the taxonomy does not know: "en:tea-bags" -> "Tea bags". */
export function humanizeTag(tag: string): string {
  const s = tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface Taxonomies {
  categories: Taxonomy;
  ingredients: Taxonomy;
  additives: Taxonomy;
  additivesClasses: Taxonomy;
}

export async function loadTaxonomies(dir: string): Promise<Taxonomies> {
  const [categories, ingredients, additives, additivesClasses] = await Promise.all(
    ['categories', 'ingredients', 'additives', 'additives_classes'].map((n) => Taxonomy.load(`${dir}/${n}.json`)),
  );
  return { categories, ingredients, additives, additivesClasses };
}

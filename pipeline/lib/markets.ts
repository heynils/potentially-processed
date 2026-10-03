// Which products the site is for: ranking by market, and the quotas that give
// smaller markets (Sweden) places whatever their scan counts. Shared by the
// extract stage (which products to keep) and the select stage.

import { compareRank, type RejectReason } from './normalize.ts';
import type { Candidate } from './types.ts';

/** compareRank, but products sold in a priority country come first. */
export function marketFirst(priority: Set<string>): (a: Candidate, b: Candidate) => number {
  const served = (c: Candidate) => (c.countries.some((t) => priority.has(t)) ? 1 : 0);
  return (a, b) => served(b) - served(a) || compareRank(a, b);
}

/**
 * A market that gets up to `max` places on the site whatever its products'
 * popularity: Swedish products are scanned far less often than British or
 * American ones, so on scan counts alone few would make it.
 */
export interface MarketQuota {
  name: string;
  /** Products sold in one of these countries belong to the market... */
  countries: string[];
  /** ...and so do products labelled in one of these languages. */
  languages: string[];
  max: number;
}

export const inMarket = (m: Pick<MarketQuota, 'countries' | 'languages'>, c: Pick<Candidate, 'countries' | 'lang'>): boolean =>
  m.languages.includes(c.lang) || c.countries.some((t) => m.countries.includes(t));

/**
 * `compare`, but products of a quota market come first. The extract stage
 * ranks its pool this way, so it keeps every eligible product of a quota
 * market, however rarely scanned, before the most popular of the rest.
 */
export function quotaFirst(
  quotas: MarketQuota[],
  compare: (a: Candidate, b: Candidate) => number,
): (a: Candidate, b: Candidate) => number {
  if (!quotas.length) return compare;
  const q = (c: Candidate) => (quotas.some((m) => inMarket(m, c)) ? 1 : 0);
  return (a, b) => q(b) - q(a) || compare(a, b);
}

/**
 * Why a valid product stays out of the pool, if it does. A product without a
 * category gets no alternatives, ranking or category page, so it is only
 * worth a place in a quota market, where every product counts (about a third
 * of Sweden's eligible products have no category). Elsewhere there are more
 * products with one than the site has room for.
 */
export function poolReject(c: Pick<Candidate, 'categories' | 'countries' | 'lang'>, quotas: MarketQuota[]): RejectReason | null {
  return c.categories.length === 0 && !quotas.some((m) => inMarket(m, c)) ? 'no-category' : null;
}

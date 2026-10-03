# CLAUDE.md

Static, ad-supported lookup site: "Is it ultra-processed?". One page per food
product with its NOVA group (1-4), the ingredient list with NOVA markers
highlighted and explained, and less-processed alternatives from the same
category. Plus category pages, ingredient/additive pages and Pagefind search.

Owner: Nils, an experienced developer (.NET, React, Azure, Docker, GitHub
Actions). No need to explain basics. He prefers textbook-style explanations
that define terms inline over terse summaries.

## Commands

```sh
npm ci
npm run data:sample   # offline: build data/site/ from the committed sample (~300 products)
npm run data          # full: stream the 13 GB OFF export (~10 min), then select
npm run dev           # Astro dev server (search needs a build: no Pagefind index in dev)
npm run build         # astro build + pagefind index -> dist/
npm test              # pipeline unit tests (node:test, no deps)
npm run check         # astro check (types for src/ and pipeline/)
```

Node >= 22.18 (runs `.ts` directly via type stripping; Astro 7 needs >= 22.12).
Pipeline code must stay erasable TypeScript: no enums, no parameter
properties, `.ts` extensions in imports.

## Layout

- `pipeline/` data pipeline, TypeScript run directly by Node
  - `extract.ts` stage 1: stream export -> `data/work/candidates.jsonl` (top 60k by popularity)
  - `select.ts` stage 2: candidates + taxonomies -> `data/site/*.json`
  - `fetch-taxonomies.ts`, `make-fixture.ts` (regenerates `pipeline/fixtures/`)
  - `lib/types.ts` the data contract shared with the site
  - `lib/build.ts` pure selection/category/alternatives/marker logic (unit-tested)
  - `config.ts` all tunables (target size, thresholds, generic categories, aliases)
- `src/` Astro site; reads `data/site/` at build time via `src/lib/data.ts`
  - `src/lib/explain.ts` curated marker descriptions and "kinds" (editorial content)
  - `src/lib/nova.ts` NOVA group definitions (Monteiro et al. 2019)
- `.github/workflows/deploy.yml` weekly data refresh + build + deploy to Pages
- `data/` is gitignored: never commit the OFF dump or generated data

## Decisions (made with Nils; don't relitigate without asking)

- English only for v1. ~5,000 products with complete data, not the whole DB.
- Astro (static output), Pagefind for search, `@astrojs/sitemap`.
- Data: OFF bulk JSONL export, never the live API (no full-text search, rate
  limits). Hosting: GitHub Pages via custom Actions workflow. Cloudflare Pages
  later is only a DNS change.
- Design: basic and clean. Archivo Variable (self-hosted, uses the width axis).
  Avoid the generic generated look: no cream + terracotta, no near-black + acid
  green, no identical rounded cards with soft shadows, no all-caps eyebrow
  labels, no "→" on links. Lines under 80 characters, visible focus,
  responsive, respect reduced motion. Colour is reserved for the NOVA scale.

## Must-haves (don't remove)

- Open Food Facts credit + ODbL link on every product page and in the footer;
  photo credit (CC BY-SA) where photos show.
- Note that NOVA groups are automated estimates from crowdsourced data.
- Short health disclaimer.
- Pages must carry real value (explanations, alternatives, comparisons), not
  thin generated text. Don't repeat the same sentence per item: explain a
  marker *kind* once, describe each marker individually.
- Ad slot stays empty: `AdSlot.astro` renders nothing until
  `PUBLIC_ADSENSE_CLIENT` and a slot id are set. Don't add AdSense code
  until Nils says it's approved.

## Data facts learned from the real export (Oct 2026)

- 4.79M products; ~367k pass the filters (English label, NOVA group, parsed
  ingredients, category, name). Extract takes ~10 min on 4 vCPUs, CPU-bound
  on JSON.parse; the byte pre-filter skips ~80% of lines.
- No precomputed image URL in the JSONL: build it from `images.front_<lang>`
  (legacy) or `images.selected.front.<lang>` (newer), see `normalize.ts`.
- `completeness` can exceed 1; `nova_group` may be a string; categories
  include free-text tags like `en:Plain Flour` and `en:null`.
- NOVA markers are reported at whatever taxonomy level carries the NOVA
  property (`en:whey` for `en:whey-powder`), so match by ancestry. Additive
  variants (`en:e440a`) are not linked to their base number in either
  taxonomy; `ingredientAncestors()` adds those links.
- `popularity_key` = scan-stats year + per-country percentile tier + scans.
  Ranking uses the year, then `unique_scans_n` (see `compareRank`), and the
  select stage puts products sold in `PRIORITY_COUNTRIES` first (otherwise
  Moroccan products with English labels dominate the top of the list).
- Some ingredient lists are truncated to one entry ("water" for a mayo);
  `hasImplausibleIngredients()` drops those (71 in the Oct 2026 run).

## Open items (Nils only)

Create/confirm repo settings: Pages source = "GitHub Actions"; buy a domain
(none chosen yet) and set it under Settings -> Pages; Search Console; apply
for AdSense once there's real traffic, then set the `ADSENSE_CLIENT` and
`AD_SLOT_*` repository variables.

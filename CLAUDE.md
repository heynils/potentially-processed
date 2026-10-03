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
npm run data:sample   # offline: build data/site/ from the committed sample (~600 products, some Swedish)
npm run data          # full: stream the 13 GB OFF export (~11 min), then select
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
  - `extract.ts` stage 1: stream export -> `data/work/candidates.jsonl` (150k: every
    product of a quota market, then the most popular from the served countries)
  - `select.ts` stage 2: candidates + taxonomies -> `data/site/*.json`
  - `fetch-taxonomies.ts`, `make-fixture.ts` (regenerates `pipeline/fixtures/`)
  - `fetch-published.ts` reads the live sitemap + `/redirects.json` so select keeps
    published products first and redirects renamed slugs (URL stability for SEO)
  - `lib/types.ts` the data contract shared with the site
  - `lib/build.ts` pure selection/category/alternatives/marker logic (unit-tested)
  - `lib/markets.ts` market ranking, quotas (Sweden) and which products enter the pool;
    shared by extract and select
  - `config.ts` all tunables (target size, thresholds, generic categories, aliases)
- `src/` Astro site; reads `data/site/` at build time via `src/lib/data.ts`
  - `src/lib/explain.ts` curated marker descriptions and "kinds" (editorial content)
  - `src/lib/nova.ts` NOVA group definitions (Monteiro et al. 2019), short labels, icons
  - `src/components/` `NovaScale` (the 1-4 scale, farm to factory), `ProductThumb` /
    `ProductList` / `ProductTiles` (products with photos), `Icon` (`<use>` of the
    Lucide sprite `/icons.svg`, built from `lucide-static` in `src/lib/icons.ts`;
    add icons by importing them there)
  - `src/integrations/compact-html.ts` post-build pass: strips indentation and
    renames Astro's scoped classes to short ones (~30% smaller pages)
- `.github/workflows/deploy.yml` weekly data refresh + build + deploy to Pages
- `data/` is gitignored: never commit the OFF dump or generated data

## Decisions (made with Nils; don't relitigate without asking)

- Site text is English. Products: ingredient lists in English or Swedish
  (`LANGUAGES`; Nils, Oct 2026: "add Swedish products too, as many as is
  possible for the setup"). Swedish names and ingredients are shown as
  printed, marked `lang="sv"`; `<html lang>` stays "en" (Pagefind splits its
  index by that attribute, and search must cover both).
- Product count fills GitHub Pages' 1 GB cap: ~40,000 products at ~20 KB per
  product page. Every byte on a product page costs products, so keep pages
  lean and check the `dist` size after template changes (the workflow fails
  the build over 1 GB; lower `TARGET_PRODUCTS` if it does).
- Markets: products sold in `PRIORITY_COUNTRIES` (English-speaking + Sweden)
  rank first. Sweden is a quota market (`MARKET_QUOTAS`): all its eligible
  products get in whatever their scans, even without a category. Alternatives
  prefer products sold in the same country; search has a "Sold in" filter
  (Pagefind filter `country` on product pages).
- Astro (static output), Pagefind for search, `@astrojs/sitemap`.
- Data: OFF bulk JSONL export, never the live API (no full-text search, rate
  limits). Hosting: GitHub Pages via custom Actions workflow. Cloudflare Pages
  later is only a DNS change.
- Design: basic and clean. Archivo Variable (self-hosted, uses the width axis).
  Avoid the generic generated look: no cream + terracotta, no near-black + acid
  green, no identical rounded cards with soft shadows, no all-caps eyebrow
  labels, no "→" on links. Lines under 80 characters, visible focus,
  responsive, respect reduced motion. Colour is reserved for the NOVA scale.
- Pages lead with the answer and keep text short (Nils: "a lot of text" before
  the Oct 2026 redesign). Product page order: verdict (scale + reason chips),
  alternatives as photo tiles, highlighted ingredients, explanations (first
  sentence per marker, long lists folded), ranking, compact "about". Put depth
  on marker pages and behind `<details>`, not in front of the verdict.
- Product photos are hotlinked from images.openfoodfacts.org, never copied:
  100/200/400 px versions differ only in the URL suffix (`imageAt()` in
  `src/lib/data.ts`). Thumbs are lazy, in fixed boxes (no layout shift), with
  the group icon when a product has no photo.
- Every indexed page sets Pagefind's `image` meta explicitly (`none` when it
  has no photo); otherwise Pagefind uses the first photo on the page, which on
  a product page can be an alternative's.

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

- 4.79M products; ~368k pass the filters (NOVA group, name and parsed
  ingredients in English or Swedish, category). Extract takes ~11 min on 4
  vCPUs (8 on the Actions runner), CPU-bound on JSON.parse; the byte
  pre-filter skips ~80% of lines.
- The parsed ingredient tree is in `ingredients_lc`, which can differ from
  the pack's `lang` (a Swedish label with a French ingredient list); the page
  language follows `ingredients_lc`, and the name must be in it too.
- Sweden: ~31k products are sold there or labelled in Swedish, but ~70% have
  no ingredient list, so no NOVA group. ~3.9k pass every filter; ~2.2k more
  have a NOVA group but no category (kept, as a quota market).
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
- OFF's additive NOVA rules live in its code, not the taxonomy JSON. OFF
  lists every applicable marker per product (group 3 ones too), so a common
  additive never listed as a marker isn't one; those get "not a marker" pages
  (`group: null` in `SiteMarker`). Variants of markers (E322i) are excluded.
- Some ingredient lists are truncated to one entry ("water" for a mayo);
  `hasImplausibleIngredients()` drops those (71 in the Oct 2026 run).

## Open items (Nils only)

Create/confirm repo settings: Pages source = "GitHub Actions"; buy a domain
(none chosen yet) and set it under Settings -> Pages; Search Console; apply
for AdSense once there's real traffic, then set the `ADSENSE_CLIENT` and
`AD_SLOT_*` repository variables.

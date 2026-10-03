# Is it ultra-processed?

A static lookup site for packaged food. Every product page shows the
product's **NOVA group**, the ingredients that put it there (highlighted and
explained), and less-processed alternatives from the same category. Category
pages rank products from least to most processed, and ingredient and additive
pages explain what each marker is and where it turns up.

There is no backend. A data pipeline turns the Open Food Facts export into
JSON, Astro renders about 42,000 static pages from it, and Pagefind adds a
search index that runs in the browser. A scheduled GitHub Actions workflow
rebuilds and redeploys everything weekly.

The site is written in English and covers products sold in English-speaking
countries and in Sweden. Swedish products keep their Swedish names and
ingredient lists, as printed on the pack.

- [How it works](#how-it-works)
- [The data pipeline](#the-data-pipeline)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Licensing and attribution](#licensing-and-attribution)

## How it works

**NOVA** is a classification of food by the extent and purpose of industrial
processing, developed at the University of São Paulo. It has four groups:
(1) unprocessed or minimally processed foods, (2) processed culinary
ingredients such as oil and sugar, (3) processed foods, and (4)
ultra-processed foods. A food lands in group 4 when it contains a **marker**:
an ingredient that home kitchens rarely use (maltodextrin, protein isolates,
glucose syrup) or a "cosmetic" additive (flavourings, emulsifiers, colours,
sweeteners).

**Open Food Facts** (OFF) is a crowdsourced database of about 4.8 million
food products. It computes each product's NOVA group automatically from the
ingredient list, and it records *which* markers triggered the group. The site
builds on that: it doesn't classify anything itself. It explains OFF's
classification and compares products with each other.

```
OFF JSONL export (13 GB gzip, ~4.8M products)
        │  stream, filter, rank            pipeline/extract.ts   ~8-11 min
        ▼
data/work/candidates.jsonl (150k: all Swedish, then the most popular)
        │  dedupe, balance, categorise,    pipeline/select.ts    ~9 s
        │  match markers, find alternatives
        ▼
data/site/*.json (40,000 products, ~1,400 categories, ~320 markers)
        │  astro build + compact + pagefind  npm run build       ~2.5 min
        ▼
dist/ (~42k static pages + search index, ~910 MB) → GitHub Pages
```

## The data pipeline

The pipeline is plain TypeScript that Node runs directly. Node 22.18+ strips
type annotations at load time, so there's no compile step. It has no
dependencies beyond Node itself.

### Stage 1: extract (`pipeline/extract.ts`)

The OFF export is **JSONL** (JSON Lines): one product per line, one JSON
object per product, about 24 KB each. Uncompressed that is roughly 100 GB, so
the extract stage never holds or stores it. It streams the gzip file from the
URL (or a local file), decompresses on the fly and handles one line at a
time.

Three techniques keep this fast and memory-flat:

1. **Byte-level pre-filtering.** Most products can't qualify because they
   have no NOVA group or no ingredient list in a language the site shows
   (English or Swedish). Each line is checked for the raw bytes
   `"nova_group":` and a language marker such as `"ingredients_lc":"sv"`
   *before* it is decoded or parsed. That skips `JSON.parse` for about 80% of
   lines, and the result is identical because those lines would fail the
   real check anyway.
2. **Validation into a slim record** (`lib/normalize.ts`). A product passes
   only if it has a NOVA group, a usable name and a parsed ingredient tree,
   all in English or Swedish. The language that counts is `ingredients_lc`,
   the one OFF parsed the ingredient list in, because that is the language of
   the tree the page highlights; it can differ from the pack's main language
   (`lang`). The product is reduced to about 2 KB: name, brand, NOVA group,
   markers, ingredient tree, additives, categories, image URL and
   popularity. Rejected products are counted by reason, and those counts are
   published on the About page.
3. **A bounded top-K heap** (`lib/top-k.ts`). A **min-heap** is a tree in
   which every parent is "smaller" than its children, so the root is always
   the smallest element. Keeping the 150,000 best products in a min-heap
   puts the *worst* kept product at the root. A new product only needs to
   beat the root to get in, which costs O(log k). Memory stays at 150,000
   records no matter how big the export is. "Best" means: every product of a
   quota market (Sweden, see below) first, then products sold in the
   countries the site serves, each group ordered by popularity.

**Popularity** needed care. OFF's `popularity_key` looks like a single
number, but it is composite: a two-digit year, then a percentile tier
computed *per country*, then a scan count. Sorting by it puts the 50th most
scanned product in a small market above a staple scanned by thousands of
people in the UK. The pipeline therefore ranks by the key's year (recently
scanned first, which also demotes discontinued products), then by
`unique_scans_n`, the number of distinct people who scanned the barcode.

A truncated download can't silently produce a small site. gzip ends with a
checksum, so a cut-off stream makes the run fail, and `--min-lines` fails the
run if far fewer products arrive than expected.

### Stage 2: select (`pipeline/select.ts`, logic in `lib/build.ts`)

This stage works on the 150,000 candidates in memory and produces everything
the site renders.

- **Market first.** Open Food Facts is global, and Morocco and India, for
  example, have many heavily scanned products with English labels. Products
  sold in the countries the site serves (the UK, US, Ireland, Canada,
  Australia, New Zealand and Sweden: `PRIORITY_COUNTRIES` in `config.ts`)
  therefore rank ahead of the rest, and popularity orders each group.
- **Quota markets.** Swedish products are scanned far less often than
  British or American ones: only a few dozen have recent scan statistics.
  Ranked on popularity, almost none would make the cut. Sweden is therefore a
  *quota market* (`MARKET_QUOTAS`): up to 20,000 products sold there or
  labelled in Swedish are selected first, which in practice is all of them.
  Unlike everywhere else, they don't need a category, since a third of the
  eligible Swedish products have none; their pages simply have no
  alternatives or ranking. The bottleneck is the data itself: of about 31,000
  Swedish products on Open Food Facts, 70% have no ingredient list, so no
  NOVA group.
- **Plausibility.** A few crowdsourced ingredient lists are truncated to one
  entry, such as a fat-free mayonnaise whose whole list reads "water". Such a
  product would look minimally processed and get recommended as an
  alternative. Products whose only ingredient is water (outside the waters
  category) or a single additive are dropped. Other single-ingredient
  products, such as oats, flour and plain yoghurt, are fine.

- **Dedupe.** The same product often exists under several barcodes (pack
  sizes, regional prints). The pipeline keeps the most popular barcode per
  brand and name, because near-duplicate pages are what search engines
  penalise as thin content.
- **Balanced selection.** Taking the top products by popularity would leave
  many popular ultra-processed products with nothing less processed to point
  to, because plain foods get scanned less. So 80% of the slots go to the
  most popular products. The pipeline then walks those in order and, wherever
  a product's category has fewer than two lower-NOVA products, pulls the most
  popular ones in from the pool, climbing to a broader category if needed.
  Popularity fills whatever is left.
- **Taxonomies.** OFF publishes its vocabularies as **taxonomies**: graphs of
  tags with parent links (`en:soya-lecithin` → `en:e322i` → `en:e322`). The
  pipeline downloads four of them, for categories, ingredients, additives and
  additive classes, to get English names, category hierarchies and the links
  needed for the next step.
- **Marker matching.** OFF reports markers at whatever level of the taxonomy
  carries the NOVA property. A product made with "whey powder" gets the marker
  `en:whey`, and one with "soya lecithin" gets `en:e322`. To highlight the
  right ingredient, the pipeline checks whether each marker is an *ancestor*
  of the ingredient in the taxonomy graph, rather than comparing ids. A few
  links are missing from both taxonomies, such as additive sub-variants like
  `en:e440a` → `en:e440`. `ingredientAncestors()` adds those by rule, and
  `config.ts` holds a short alias list taken from the real data.
- **Categories and alternatives.** A category gets a page once it has 8 or
  more products. Within a category, products are ordered least processed
  first: by NOVA group, then by the number of group-4 markers, additives and
  ingredients. Each product's alternatives are the most popular lower-group
  products from its most specific category page, falling back to the parent
  category. Alternatives sold in the same country come first, because an
  alternative you can't buy doesn't help: a Swedish ketchup is offered
  Swedish ketchups before British ones.
- **Additives that aren't markers.** People ask "is citric acid
  ultra-processed?" as often as "is maltodextrin?", and "no" is a useful
  answer. Every additive in 5 or more products that OFF never lists as a
  marker gets a page that says so, with how processed the products
  containing it are anyway. OFF keeps its additive rules in code, not in the
  taxonomy files, but it lists *every* marker that applies to a product,
  including weaker group 3 ones. So an additive that is common here and never
  listed is not a marker. Forms of a marker, such as E322i (a form of the
  marker E322), are excluded.

### Keeping URLs stable

Search engines rank individual URLs, so a page that disappears loses the
traffic it has earned, and every link pointing to it breaks. Two things
would otherwise cause that every week:

- **Re-ranking.** Products drift in and out of the selection as scan counts
  change, and the whole ranking can reshuffle when OFF rolls its scan
  statistics over to a new year.
- **Renames.** Contributors edit product names, which changes the slug.

So the live site is treated as the record of what is published.
`pipeline/fetch-published.ts` reads its sitemap and its `redirects.json`, and
the select stage puts those products first in the pool. They keep their
place for as long as they remain eligible, and new products fill only the
places freed by ones that drop out. A product whose slug changed keeps its
new URL, and Astro writes a redirect page at every old one. The redirect
list is published at `/redirects.json` and read back by the next build, so
redirects last as long as the product stays on the site, not just one week.

### Numbers from a real run (export of 3 October 2026)

| Step | Products |
| --- | ---: |
| In the export | 4,789,632 |
| No NOVA group | −3,623,565 |
| Ingredients not in English or Swedish | −620,079 |
| No category (outside Sweden) | −72,140 |
| No usable name | −17,440 |
| No parsed ingredients | −8,919 |
| Invalid barcode | −271 |
| **Eligible** (6,142 of them Swedish) | **447,218** |
| Pool kept by extract | 150,000 |
| Evidently truncated ingredient lists | −152 |
| After merging duplicates | 136,250 |
| **On the site** (5,821 of them Swedish) | **40,000** |

On the site, 4,983 products are in group 1, 1,062 in group 2, 9,398 in group
3 and 24,557 in group 4. 92% of the products in groups 2 to 4 have at least
one less-processed alternative, and 759 products were pulled in specifically
to make that possible. There are 1,384 category pages and 203 ingredient and
additive pages, plus 120 pages for common additives that aren't markers.

Two things in the export are easy to miss. `categories_hierarchy` is empty
in many records whose `categories_tags` has the categories (a quarter of the
Swedish ones, including Bregott and Pågen), so the pipeline falls back to
the tags. And the pack's language (`lang`) isn't always the language of the
ingredient list: the first version of this site showed 92 "English" products
whose ingredient lists were in French or Spanish.

The extract stage takes about 8 minutes on the Actions runner and 11 on a
4-core laptop. It is CPU-bound on JSON parsing, not on the download.

## Local development

Requires Node 22.18 or newer (see `.nvmrc`).

```sh
npm ci
npm run data:sample   # build data/site/ from the committed sample, offline, in seconds
npm run dev           # http://localhost:4321
```

The sample in `pipeline/fixtures/` is a trimmed extract of real OFF data:
about 600 products from eight categories, Swedish ones included, plus
taxonomies trimmed to the tags they use. Pages built from it show a "sample data" banner, and the
deploy workflow refuses to publish them.

Other commands:

```sh
npm run data       # full pipeline against the live export (~11 min, ~2 GB RAM, no disk)
npm run build      # static site + search index in dist/ (search doesn't work in dev)
npm run preview    # serve dist/
npm test           # pipeline unit tests (node:test)
npm run check      # astro check: type-checks src/ and pipeline/
```

To regenerate the sample after a full run, save the export locally (for
example with `curl -o data/work/export.jsonl.gz`) and run
`node pipeline/make-fixture.ts`.

Tunables live in `pipeline/config.ts`: the number of products, the balance
share, the page thresholds and the categories treated as too generic.
Editorial content lives in `src/lib/explain.ts`, which holds the marker
descriptions, and `src/lib/nova.ts`, which holds the group definitions.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`, weekly on
Mondays, and on demand.

- The 8-minute extract runs only on the weekly schedule, when the extract
  code changes, or when you tick *refresh data* on a manual run. Its output,
  about 280 MB, is stored in the Actions cache. Every other run restores it
  and goes straight to the select stage and the build.
- The base URL comes from `actions/configure-pages`, so the same build works
  at `https://<user>.github.io/<repo>/` and later on a custom domain at `/`.
- Before selecting products, it reads the live site's sitemap (see
  [Keeping URLs stable](#keeping-urls-stable)). If the site can't be
  reached, as on a first deploy, the build simply starts fresh.

One-time setup, which only the repository owner can do:

1. In **Settings → Pages**, set the source to **GitHub Actions**.
2. Push to `main`, or run the workflow manually. The first run downloads the
   export.
3. Once a domain is bought, add it in **Settings → Pages → Custom domain** and
   point DNS at GitHub. No code change is needed. AdSense won't accept a
   `github.io` address.
4. Add the site to Google Search Console and submit `sitemap-index.xml`.
5. After AdSense approval, add the repository *variables* `ADSENSE_CLIENT`
   and `AD_SLOT_PRODUCT_TOP` (plus the other `AD_SLOT_*` ones in the
   workflow). Ad units appear only where both a client id and a slot id are
   set. Also add `public/ads.txt` with the line AdSense gives you.

Limits worth knowing about GitHub Pages: sites can be up to 1 GB, a
deployment times out after 10 minutes, and there is a soft bandwidth limit of
100 GB a month (photos come from Open Food Facts, so they don't count).

The 1 GB limit is what sets the number of products. A product page is about
20 KB, so 40,000 products make a site of about 910 MB, leaving room for
weekly changes and for the AdSense markup. To get there, the build
post-processes every page (`src/integrations/compact-html.ts`): it strips
indentation and renames Astro's scoped-style classes (`astro-1a2b3c4d`) to
short ones, which makes pages about 25% smaller, and icons come from one
shared sprite instead of being repeated in every page. The workflow reports
the size of `dist` and refuses to deploy over 1 GB; if that ever trips, lower
`TARGET_PRODUCTS` in `pipeline/config.ts`. The free plan needs a public repository.
GitHub's terms say Pages isn't meant as free hosting for a commercial
business. An ad-supported information site is a grey area, and moving to
Cloudflare Pages is a DNS change.

## Licensing and attribution

- **Data.** Open Food Facts data is under the
  [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
  The site credits Open Food Facts and links the licence in the footer and on
  every product page, and those credits must stay. The ODbL is *share-alike*
  for databases: if you ever publish the derived dataset itself (for example
  `data/site/*.json`), it must be under the ODbL too. Pages built from it are
  "produced works" and only need the attribution.
- **Photos.** Product photos are by OFF contributors under CC BY-SA 3.0.
  They are credited on each product page and loaded from
  `images.openfoodfacts.org`. Set `showProductImages: false` in
  `src/lib/site.ts` to turn them off.
- **Sample.** `pipeline/fixtures/` is an extract of OFF data and is itself
  under the ODbL.

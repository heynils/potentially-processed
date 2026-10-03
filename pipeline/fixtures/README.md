# Development sample

`sample.jsonl.gz` holds about 600 real product records from the Open Food Facts
export, trimmed to the fields the pipeline reads, plus a few records the filters
should reject. `taxonomies/` holds the four OFF taxonomies trimmed to the tags
those records use. `npm run data:sample` builds a small but realistic site from
them, offline.

Regenerate with `node pipeline/make-fixture.ts` after a full pipeline run that
kept the export on disk (`data/work/export.jsonl.gz`).

This sample is an extract of the Open Food Facts database and is available under
the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Source: [Open Food Facts](https://world.openfoodfacts.org/) and its contributors.

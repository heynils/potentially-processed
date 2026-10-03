// Downloads the OFF taxonomies the select stage needs (a few MB each) into
// data/work/taxonomies/. They map tags to English names, give the parent
// links used to match NOVA markers to ingredients, and carry the additive
// class definitions shown on marker pages.
//
//   node pipeline/fetch-taxonomies.ts [--out data/work/taxonomies]

import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { TAXONOMIES, TAXONOMY_URL, WORK_DIR } from './config.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: `${WORK_DIR}/taxonomies` } } });
await mkdir(args.out, { recursive: true });

for (const name of TAXONOMIES) {
  const url = `${TAXONOMY_URL}/${name}.json`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      JSON.parse(body); // fail here, not in the select stage, if the file is broken
      await writeFile(`${args.out}/${name}.json`, body);
      console.error(`${name}: ${(body.length / 1e6).toFixed(1)} MB`);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  if (lastError) throw new Error(`Could not fetch ${url}: ${lastError}`);
}

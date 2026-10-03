// Stage 1: stream the Open Food Facts JSONL export and keep the POOL_SIZE
// best products that pass the eligibility filters: every product of a quota
// market (MARKET_QUOTAS), then the most popular of the rest, products sold in
// a PRIORITY_COUNTRIES market first (the order the select stage uses).
//
//   curl -sSfL "$EXPORT_URL" | node pipeline/extract.ts --input -
//   node pipeline/extract.ts --input pipeline/fixtures/sample.jsonl
//
// Input may be gzipped or plain. Output goes to data/work/:
//   candidates.jsonl   one Candidate per line, best first
//   extract-stats.json the filter funnel (how many products failed which check)

import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { LANGUAGES, MARKET_QUOTAS, POOL_SIZE, PRIORITY_COUNTRIES, WORK_DIR } from './config.ts';
import { inMarket, marketFirst, poolReject, quotaFirst } from './lib/markets.ts';
import { normalize } from './lib/normalize.ts';
import { openInput, splitLines } from './lib/stream.ts';
import { TopK } from './lib/top-k.ts';
import type { Candidate } from './lib/types.ts';

const { values: args } = parseArgs({
  options: {
    input: { type: 'string', default: '-' },
    out: { type: 'string', default: WORK_DIR },
    pool: { type: 'string', default: String(POOL_SIZE) },
    // Guards against silently building the site from a truncated download.
    'min-lines': { type: 'string', default: '0' },
  },
});

// Byte patterns for a cheap pre-check before decoding and parsing a line.
// The export is compact JSON, so keys are always written as `"key":value`.
// A line that lacks them would be rejected by normalize() anyway, for the
// same reason, so the funnel counts stay identical; we just skip JSON.parse
// for the ~80% of lines that cannot qualify.
const HAS_NOVA = Buffer.from('"nova_group":');
// normalize() takes the language from ingredients_lc, else lang.
const HAS_LANGUAGE = [...LANGUAGES].flatMap((l) => [Buffer.from(`"ingredients_lc":"${l}"`), Buffer.from(`"lang":"${l}"`)]);

const pool = new TopK<Candidate>(Number(args.pool), quotaFirst(MARKET_QUOTAS, marketFirst(PRIORITY_COUNTRIES)));
const rejected: Record<string, number> = {};
let linesRead = 0;
let parseErrors = 0;
let eligible = 0;
const eligibleByMarket: Record<string, number> = Object.fromEntries(MARKET_QUOTAS.map((m) => [m.name, 0]));
const started = Date.now();

const reject = (reason: string) => {
  rejected[reason] = (rejected[reason] ?? 0) + 1;
};

for await (const line of splitLines(await openInput(args.input))) {
  if (line.length === 0) continue;
  linesRead++;
  if (linesRead % 250_000 === 0) {
    const secs = (Date.now() - started) / 1000;
    console.error(`  ${linesRead.toLocaleString('en')} lines, ${eligible.toLocaleString('en')} eligible, ${secs.toFixed(0)}s`);
  }

  if (line.indexOf(HAS_NOVA) === -1) {
    reject('no-nova-group');
    continue;
  }
  if (!HAS_LANGUAGE.some((pattern) => line.indexOf(pattern) !== -1)) {
    reject('other-language');
    continue;
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line.toString('utf8'));
  } catch {
    parseErrors++;
    continue;
  }

  const result = normalize(raw, LANGUAGES);
  if (!result.ok) {
    reject(result.reason);
    continue;
  }
  const notWanted = poolReject(result.candidate, MARKET_QUOTAS);
  if (notWanted) {
    reject(notWanted);
    continue;
  }
  eligible++;
  for (const m of MARKET_QUOTAS) if (inMarket(m, result.candidate)) eligibleByMarket[m.name]++;
  pool.push(result.candidate);
}

const minLines = Number(args['min-lines']);
if (linesRead < minLines) {
  console.error(`Read only ${linesRead} lines (expected at least ${minLines}). Truncated download? Aborting.`);
  process.exit(1);
}

const candidates = pool.sorted();
await mkdir(args.out, { recursive: true });
await writeFile(`${args.out}/candidates.jsonl`, candidates.map((c) => JSON.stringify(c)).join('\n') + '\n');
const stats = { input: args.input, linesRead, parseErrors, rejected, eligible, eligibleByMarket, pooled: candidates.length };
await writeFile(`${args.out}/extract-stats.json`, JSON.stringify(stats, null, 2) + '\n');

console.error(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.error(JSON.stringify(stats, null, 2));

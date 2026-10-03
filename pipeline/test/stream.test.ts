import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openInput, splitLines } from '../lib/stream.ts';
import { TopK } from '../lib/top-k.ts';

async function collect(chunks: string[]): Promise<string[]> {
  async function* gen() {
    for (const c of chunks) yield Buffer.from(c);
  }
  const out: string[] = [];
  for await (const line of splitLines(gen())) out.push(line.toString());
  return out;
}

test('splitLines handles lines split across chunks and a missing final newline', async () => {
  assert.deepEqual(await collect(['{"a":', '1}\n{"b"', ':2}\n', '{"c":3}']), ['{"a":1}', '{"b":2}', '{"c":3}']);
  assert.deepEqual(await collect(['x\n\ny\n']), ['x', '', 'y']);
});

test('openInput reads plain and gzipped files alike', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-'));
  const body = '{"code":"1"}\n{"code":"2"}\n';
  await writeFile(join(dir, 'a.jsonl'), body);
  await writeFile(join(dir, 'a.jsonl.gz'), gzipSync(body));
  for (const name of ['a.jsonl', 'a.jsonl.gz']) {
    const lines: string[] = [];
    for await (const l of splitLines(await openInput(join(dir, name)))) lines.push(l.toString());
    assert.deepEqual(lines, ['{"code":"1"}', '{"code":"2"}'], name);
  }
});

test('openInput fails loudly on a truncated gzip file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-'));
  const gz = gzipSync('{"code":"1"}\n'.repeat(1000));
  await writeFile(join(dir, 'cut.jsonl.gz'), gz.subarray(0, gz.length - 20));
  await assert.rejects(async () => {
    for await (const _ of splitLines(await openInput(join(dir, 'cut.jsonl.gz')))) {
      // drain
    }
  });
});

test('TopK keeps the best k in order', () => {
  const top = new TopK<number>(3, (a, b) => b - a);
  for (const n of [5, 1, 9, 3, 7, 2, 8]) top.push(n);
  assert.deepEqual(top.sorted(), [9, 8, 7]);
  assert.equal(top.wouldAccept(6), false);
  assert.equal(top.wouldAccept(10), true);
});

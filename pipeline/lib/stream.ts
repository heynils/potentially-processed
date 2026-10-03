import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

async function openSource(path: string): Promise<Readable> {
  if (path === '-') return process.stdin;
  if (/^https?:\/\//.test(path)) {
    const res = await fetch(path);
    if (!res.ok || !res.body) throw new Error(`GET ${path}: HTTP ${res.status}`);
    return Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  }
  return createReadStream(path, { highWaterMark: 1 << 20 });
}

/**
 * Opens a file, an http(s) URL or stdin ("-") and transparently gunzips it if
 * the first two bytes are the gzip magic number, so .jsonl and .jsonl.gz both
 * work. A URL is streamed: the 13 GB export never touches the disk.
 */
export async function openInput(path: string): Promise<AsyncIterable<Buffer>> {
  const source = await openSource(path);
  const iterator = source[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const first = await iterator.next();
  if (first.done) return (async function* () {})();
  const head: Buffer = first.value;

  async function* raw(): AsyncGenerator<Buffer> {
    yield head;
    while (true) {
      const r = await iterator.next();
      if (r.done) return;
      yield r.value;
    }
  }

  if (head[0] === 0x1f && head[1] === 0x8b) {
    const gunzip = createGunzip({ chunkSize: 1 << 20 });
    // pipeline() destroys every stream on failure, so a truncated download or
    // corrupt gzip makes the consumer's for-await throw instead of ending early.
    pipeline(Readable.from(raw(), { objectMode: false }), gunzip).catch(() => {});
    return gunzip;
  }
  return raw();
}

/**
 * Splits a byte stream on "\n" without decoding it. Working on Buffers lets
 * the caller reject most lines with a cheap byte search before paying for
 * UTF-8 decoding and JSON.parse. Lines in the OFF export average ~24 KB and
 * some are several MB, so partial lines are collected and joined once.
 */
export async function* splitLines(chunks: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
  let carry: Buffer[] = [];
  for await (const chunk of chunks) {
    let start = 0;
    let nl = chunk.indexOf(0x0a, start);
    while (nl !== -1) {
      const piece = chunk.subarray(start, nl);
      if (carry.length) {
        carry.push(piece);
        yield Buffer.concat(carry);
        carry = [];
      } else {
        yield piece;
      }
      start = nl + 1;
      nl = chunk.indexOf(0x0a, start);
    }
    if (start < chunk.length) carry.push(Buffer.from(chunk.subarray(start)));
  }
  if (carry.length) yield Buffer.concat(carry);
}

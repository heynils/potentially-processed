// Post-build pass over the generated pages that drops bytes no browser
// needs. GitHub Pages caps a site at 1 GB, and with tens of thousands of
// product pages that cap decides how many products the site can carry, so
// every kilobyte per page counts. Two things go:
//
//   - Indentation and blank lines. A run of whitespace that contains a line
//     break becomes one line break, which renders exactly like the original
//     (Astro's own compressHTML deletes some of these runs outright, gluing
//     "from<a>" together, so it stays off). <pre>, <textarea>, <script> and
//     <style> contents are left alone.
//   - The long class names Astro gives scoped styles ("astro-1a2b3c4d" on
//     every element of a component with a <style> block), renamed to short
//     ones ("_1f") in the pages and the stylesheet alike.
//
// Saves about a quarter of every page; gzip on the wire saves less, but the
// 1 GB cap counts uncompressed bytes.

import type { AstroIntegration } from 'astro';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE_CLASS = /\bastro-[a-z0-9]{8}\b/g;
const RAW_TEXT = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi;

/** Collapses every whitespace run that contains a line break into a single "\n". */
export function compactWhitespace(html: string): string {
  const kept: string[] = [];
  const masked = html.replace(RAW_TEXT, (block) => `\u0000${kept.push(block) - 1}\u0000`);
  // ASCII whitespace only: a non-breaking space at the start of a line is content.
  return masked.replace(/[ \t]*\n[ \t\n]*/g, '\n').replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]);
}

/** Maps each scoped-style class to a short name, assigned in order of first sight. */
export function scopeRenamer(): (text: string) => string {
  const names = new Map<string, string>();
  return (text) =>
    text.replace(SCOPE_CLASS, (cls) => {
      let short = names.get(cls);
      if (!short) names.set(cls, (short = `_${names.size.toString(36)}`));
      return short;
    });
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

async function rewrite(files: string[], transform: (text: string) => string): Promise<{ before: number; after: number }> {
  let before = 0;
  let after = 0;
  // Bounded concurrency: tens of thousands of files, not all open at once.
  for (let i = 0; i < files.length; i += 64) {
    await Promise.all(
      files.slice(i, i + 64).map(async (file) => {
        const text = await readFile(file, 'utf8');
        const out = transform(text);
        before += Buffer.byteLength(text);
        after += Buffer.byteLength(out);
        if (out !== text) await writeFile(file, out);
      }),
    );
  }
  return { before, after };
}

export default function compactHtml(): AstroIntegration {
  return {
    name: 'compact-html',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const files = await filesUnder(fileURLToPath(dir));
        const rename = scopeRenamer();
        // Stylesheets first, so short names follow the order of the CSS.
        await rewrite(files.filter((f) => f.endsWith('.css')), rename);
        const { before, after } = await rewrite(files.filter((f) => f.endsWith('.html')), (html) => rename(compactWhitespace(html)));
        for (const f of files.filter((f) => f.endsWith('.js'))) {
          if (SCOPE_CLASS.test(await readFile(f, 'utf8'))) logger.warn(`${f} mentions a scoped class name; it was not renamed there.`);
          SCOPE_CLASS.lastIndex = 0;
        }
        const mb = (n: number) => (n / 1e6).toFixed(1);
        logger.info(`HTML ${mb(before)} MB -> ${mb(after)} MB (${Math.round((1 - after / before) * 100)}% smaller)`);
      },
    },
  };
}

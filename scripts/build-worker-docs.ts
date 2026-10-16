/**
 * Writes the docs the Ask AI Worker searches, as worker/src/generated/docs.json.
 *
 *   pnpm build && pnpm worker:docs              # from the static export in out/
 *   pnpm worker:docs --from http://localhost:3000   # from a running dev server
 *
 * The Worker bundles this file instead of fetching the docs at request time, which keeps each
 * request within the free plan's CPU limit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseLlmsText } from '../lib/ai/assistant';

const OUT_FILE = join('worker', 'src', 'generated', 'docs.json');

async function main() {
  const fromIndex = process.argv.indexOf('--from');
  const from = fromIndex === -1 ? undefined : process.argv[fromIndex + 1];
  const read = from
    ? async (file: string) => {
        const res = await fetch(`${from}/${file}`);
        if (!res.ok) throw new Error(`GET ${file} failed with ${res.status}`);
        return res.text();
      }
    : async (file: string) => readFileSync(join('out', file), 'utf8');

  const pages = parseLlmsText(await read('llms-full.txt'), await read('llms.txt'));
  if (pages.length === 0) throw new Error('No docs pages found. Run pnpm build first.');

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(pages)}\n`);
  console.log(`${OUT_FILE}: ${pages.length} pages`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

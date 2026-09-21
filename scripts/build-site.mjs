// Assemble the static site GitHub Pages serves, in _site/.
//
//   node src/indexer.mjs --rpc <url>   # first: produces out/index.json
//   node scripts/build-site.mjs
//
// The page lives at the site root, but it refers to its neighbours as
// ../src/canonical.mjs, ../out/index.json and ../hidden.json, the paths
// that work when it is served from web/ in the repository. A browser
// resolves ".." at the root to the root itself, so copying those files to
// /src, /out and / serves the same page unchanged. Nothing is rewritten,
// which keeps the published page byte-identical to the one in the repo.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const site = new URL('_site/', root);
const at = (p) => new URL(p, root);

const index = at('out/index.json');
if (!existsSync(index)) {
  console.error('no out/index.json: run the indexer first');
  process.exit(1);
}

rmSync(site, { recursive: true, force: true });
mkdirSync(new URL('src/', site), { recursive: true });
mkdirSync(new URL('out/', site), { recursive: true });

for (const f of ['index.html', 'app.js', 'abi.js', 'config.js']) {
  cpSync(at('web/' + f), new URL(f, site));
}
cpSync(at('src/canonical.mjs'), new URL('src/canonical.mjs', site));
cpSync(index, new URL('out/index.json', site));
cpSync(at('hidden.json'), new URL('hidden.json', site));
cpSync(at('docs/READING-RULES.txt'), new URL('READING-RULES.txt', site));

writeFileSync(new URL('CNAME', site), 'indelebile.xyz\n');
writeFileSync(new URL('.nojekyll', site), '');

const { entriesHash, entries } = JSON.parse(readFileSync(index, 'utf8'));
console.log(`site built: ${entries?.length ?? 0} entries, entriesHash ${entriesHash}`);

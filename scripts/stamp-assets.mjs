// Stamps every icon, image and script the page links to with a hash of
// its contents, as ?v=<hash>.
//
//   node scripts/stamp-assets.mjs
//
// Browsers keep favicons in a store of their own that ignores ordinary
// cache rules, and chat apps cache a link's preview image by URL. Neither
// will notice a file changed underneath an unchanged address; a changed
// address they cannot miss. The hash, rather than a counter, means the
// address changes exactly when the file does.
//
// Scripts are stamped for a different reason: the page and its scripts
// are cached for ten minutes each, so for a while after a release a
// visitor could get the new page with the old script, and see half of
// each. A stamped script arrives with the page that names it.
//
// It edits web/index.html in place, so the published page stays the file
// in the repository. test/web.test.mjs fails if a stamp is stale.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const web = (f) => new URL(`../web/${f}`, import.meta.url);
export const STAMPED = /((?:favicon|mark|icon-|og)[\w.-]*\.(?:svg|png|jpg)|(?:app|abi|config|i18n)\.js)(?:\?v=[0-9a-f]+)?(?=")/g;
export const stampOf = (file) =>
  createHash('sha256').update(readFileSync(web(file))).digest('hex').slice(0, 10);

if (import.meta.url === `file://${process.argv[1]}`) {
  const before = readFileSync(web('index.html'), 'utf8');
  const after = before.replace(STAMPED, (_, f) => `${f}?v=${stampOf(f)}`);
  writeFileSync(web('index.html'), after);
  const n = [...after.matchAll(STAMPED)].length;
  console.log(before === after ? `${n} assets, all stamps current` : `restamped ${n} asset links`);
}

// web/abi.js is a classic script the browser loads, so nothing else in the
// test suite would catch a broken reference in it — it parses fine and
// throws only at runtime, leaving window.JJ_ABI undefined and the page
// silently empty. That happened once; this stops it happening again.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildEntry, entryTail } from '../src/canonical.mjs';
import { encodeFunctionData, parseAbi } from 'viem';

function loadAbiJs() {
  const sandbox = { window: {}, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../web/abi.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.window.JJ_ABI;
}

test('abi.js executes and exports everything app.js imports', () => {
  const abi = loadAbiJs();
  assert.ok(abi, 'window.JJ_ABI must be set');
  for (const k of ['SEL', 'encodeWriteEntry', 'encodeBalanceOf']) {
    assert.ok(abi[k], `missing export: ${k}`);
  }
  // Log decoding and topic filters belong to the indexer. Exporting them
  // here is an invitation to re-derive the rules in the browser, which is
  // the thing the page was moved away from.
  for (const gone of ['TOPIC', 'decodeEsip3String']) {
    assert.ok(!abi[gone], `${gone} is back — the page must not read logs itself`);
  }
});

test('config.js executes and exports the fields app.js reads', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../web/config.js', import.meta.url), 'utf8'), sandbox);
  const c = sandbox.window.JJ_CONFIG;
  for (const k of ['CHAIN_ID', 'CHAIN_NAME', 'READ_RPCS', 'JOURNALS', 'JUSTICE',
                   'MIN_FEE_WEI', 'MIN_BALANCE', 'BODY_MAX_CHARS', 'MAX_TAGS', 'GENESIS_BLOCK']) {
    assert.ok(c[k] !== undefined, `missing config: ${k}`);
  }
  assert.ok(Array.isArray(c.JOURNALS) && c.JOURNALS.length, 'JOURNALS must be a non-empty list');
  assert.ok(Array.isArray(c.READ_RPCS) && c.READ_RPCS.length > 1,
    'more than one endpoint — public nodes refuse historical getLogs without warning');
  for (const j of c.JOURNALS) {
    assert.match(j.address, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(typeof j.fromBlock, 'number');
  }
});

// The page hand-rolls its ABI encoding to avoid loading a library. That is
// only safe if it agrees with a real encoder, byte for byte.
test('hand-rolled encoding matches viem for the same entry', () => {
  const abi = loadAbiJs();
  const viemAbi = parseAbi(['function writeEntry(string entryTail) payable']);
  for (const body of ['short', '记'.repeat(500), 'a "quoted" line\nand a newline']) {
    const e = buildEntry({ author: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
                           seq: 3, ts: 1757280000, tags: ['assange'], body });
    const mine = '0x' + abi.encodeWriteEntry(entryTail(e)).replace(/^0x/, '');
    const theirs = encodeFunctionData({ abi: viemAbi, functionName: 'writeEntry', args: [entryTail(e)] });
    assert.equal(mine, theirs, `mismatch for body: ${body.slice(0, 20)}`);
  }
});

test('the indexer knows the ESIP-3 event signature', () => {
  const idx = readFileSync(new URL('../src/indexer.mjs', import.meta.url), 'utf8');
  assert.match(idx, /ethscriptions_protocol_CreateEthscription\(address indexed initialOwner, string contentURI\)/,
    'the ESIP-3 signature is not ours to change');
});

// app.js reaches into the markup by id. A redesign that renames or drops
// one produces no error anywhere — the page just quietly stops working in
// that spot. Check the two files still agree.
test('every element id app.js touches exists in index.html', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const ids = new Set([...app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `index.html is missing: ${missing.join(', ')}`);
  assert.ok(ids.size > 20, 'sanity: the extraction should find many ids');
});

test('the page requests nothing from an external host', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  // Links out are fine; loading from elsewhere is not.
  const loaders = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
    .filter((m) => !/<a\b[^>]*$/.test(html.slice(0, m.index)));
  assert.deepEqual(loaders.map((m) => m[1]), [],
    'no stylesheet, script, font or image may come from another host');
});

// Assigning `.className` replaces the whole list, so an element the
// stylesheet targets by class loses all styling — with no error anywhere.
// That happened to the status box. Rather than try to spot the unsafe
// assignments, app.js uses setState()/classList and none are allowed.
test('app.js never assigns className directly', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const hits = [...app.matchAll(/^.*\.className\s*=.*$/gm)]
    .map((m) => m[0].trim())
    .filter((line) => !line.startsWith('//'));
  assert.deepEqual(hits, [],
    `use setState() instead — these drop the base class: ${hits.join(' | ')}`);
  assert.ok(app.includes('function setState'), 'the helper must still exist');
});

// Body contrast was 16.9:1 in light and 15.2:1 in dark. Print sits around
// 10–12:1, and the gap is what makes a long writing session tiring. Every
// pair must also clear WCAG AA, since the metadata is small mono text.
test('the palette is comfortable to read and clears WCAG AA', () => {
  const css = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // Two :root blocks: light first, then the dark override.
  const blocks = css.split(':root{').slice(1);
  assert.equal(blocks.length, 2, 'expected a light and a dark palette');

  for (const [i, block] of blocks.entries()) {
    const mode = i === 0 ? 'light' : 'dark';
    const read = (name) => block.match(new RegExp(`--${name}:(#[0-9a-f]{6})`))?.[1];
    const paper = read('paper');
    assert.ok(paper, `${mode}: no --paper`);

    const body = ratio(read('ink'), paper);
    assert.ok(body >= 12 && body <= 14.5,
      `${mode}: body contrast ${body.toFixed(1)}:1 — aim for 12–14.5`);

    // The secondary tiers carry most of the page's prose, so AA is not
    // enough for them: at 7:1 the page still read washed out.
    for (const name of ['ink-2', 'ink-3', 'accent', 'bad', 'ok']) {
      const c = read(name);
      if (!c) continue;
      const r = ratio(c, paper);
      assert.ok(r >= 6.4, `${mode}: --${name} is ${r.toFixed(1)}:1 against paper — too faint`);
    }
  }
});

// Red meaning both "our brand" and "something is wrong" makes neither
// legible. The accent carries identity; --bad carries failure.
test('the accent colour is not reused for errors', () => {
  const css = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const rule of ['.status.bad', '#count.over', '.holding.no']) {
    const decl = css.match(new RegExp(`\\${rule}\\{[^}]*\\}`))?.[0] ?? '';
    assert.ok(!decl.includes('var(--accent)'),
      `${rule} uses --accent; failure states belong to --bad`);
  }
});

// Background reading, and the archive's own all/mine switch, are both tab
// strips. The markup has wiring that can silently come apart: a tab whose
// panel was renamed just does nothing. Each strip is checked on its own,
// since each has its own selected tab.
test('every tab points at something that exists, and each strip opens exactly one', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const strips = [...html.matchAll(/<div class="tabs"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.ok(strips.length >= 2, 'expected the background strip and the archive strip');

  for (const strip of strips) {
    const tabs = [...strip.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"[^>]*aria-selected="(true|false)"/g)];
    assert.ok(tabs.length >= 2, 'a tab strip needs at least two tabs');

    for (const [tag, target] of tabs) {
      assert.ok(html.includes(`id="${target}"`), `tab points at a missing element: ${target}`);
      // A scope tab drives the feed; every other tab reveals a panel.
      if (!tag.includes('data-scope')) {
        assert.ok(new RegExp(`id="${target}"[^>]*role="tabpanel"`).test(html)
          || /role="tabpanel" aria-labelledby=/.test(html), 'panels need tabpanel roles');
      }
    }

    const open = tabs.filter(([, , sel]) => sel === 'true');
    assert.equal(open.length, 1, 'exactly one tab per strip must start selected');

    // Where the open tab owns a panel, that panel must not start hidden.
    const panelTag = html.match(new RegExp(`<div class="panel" id="${open[0][1]}"[^>]*>`));
    if (panelTag) assert.ok(!panelTag[0].includes('hidden'), `${open[0][1]} is selected but hidden`);
  }
});

// The archive's two views read the same index.json; "mine" is a filter over
// it, not a second source. A query against the chain here would be a second
// copy of the rules, free to disagree with the indexer's.
test('the "written by me" view filters the index rather than reading the chain', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function renderFeed'), app.indexOf('function emptyFeed'));
  assert.ok(/scope === 'mine'/.test(fn), 'renderFeed must branch on the scope');
  assert.ok(/author\?\.toLowerCase\(\) === account/.test(fn), 'mine must filter by the connected address');
  assert.ok(!/eth_call|eth_getLogs|wallet\(/.test(fn), 'the feed must not query the chain');
});

// `section` elements also carry `.shell`, and `.shell` wins on specificity.
// That silently zeroed every section's vertical padding, so content sat
// flush against the section rule and the rule landed a pixel off the
// composer's own border. Nothing errors when a rule loses like this.
test('section spacing is not overridden by the shell', () => {
  const css = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const bare = css.match(/\bsection\{([^}]*)\}/)?.[1] ?? '';
  assert.ok(!/padding/.test(bare),
    'a bare `section` padding rule loses to `.shell`; set it on `section.shell`');
  assert.ok(/section\.shell\{[^}]*padding/.test(css),
    'section.shell must carry the vertical padding');
});

// Two horizontal rules a pixel apart read as one thick smudge. The section
// rule already closes the entry list, so entries must not draw their own.
test('the last entry does not double the section rule', () => {
  const css = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.ok(!/article\.entry:last-child\{[^}]*border-bottom\s*:\s*\d/.test(css),
    'article.entry:last-child draws a border the section rule already provides');
});

// The opening statement is the one designed block of copy on the page and
// the first thing anyone reads. Left-aligned it trailed a ragged right
// edge across a widened shell, which is what made the block look adrift.
test('the opening statement is set flush both sides', () => {
  const css = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const rule = css.match(/\.lede p\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /text-align:\s*justify/, '.lede p must be justified');
  // Hyphenation is off deliberately: measured, both settings come out
  // flush, and leaving it on broke "eth-scription" across a line.
  assert.match(rule, /hyphens:\s*none/, 'hyphenation must stay off — it breaks "ethscription"');
});

// The page previews "the exact bytes that will be recorded". They are only
// exact if it knows which protocol tag the deployed contract writes — a
// rehearsal contract writes a different one, and the preview showed the
// default while the chain got the other.
test('the page knows which protocol tag the deployment uses', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../web/config.js', import.meta.url), 'utf8'), sandbox);
  const web = sandbox.window.JJ_CONFIG.PROTOCOL;
  assert.ok(web, 'web/config.js must carry PROTOCOL');

  const indexer = readFileSync(new URL('../src/config.mjs', import.meta.url), 'utf8');
  const quoted = indexer.match(/^(?!\s*\/\/)\s*protocol:\s*'([^']*)'/m)?.[1];
  const isDefault = /^(?!\s*\/\/)\s*protocol:\s*PROTOCOL\b/m.test(indexer);
  assert.equal(web, quoted ?? 'indelebile',
    'web/config.js and src/config.mjs disagree about the protocol tag');
  assert.ok(quoted || isDefault, 'src/config.mjs must set protocol');
});

// Governance can collapse an entry but never remove one. The mechanism
// existed only in the static renderer; the page people actually visit
// ignored it entirely.
test('the page honours hidden.json, and collapsing is not deletion', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(app, /hidden\.json/, 'the page must read hidden.json');
  assert.match(app, /hidden\.get\(/, 'and apply it when rendering an entry');
  // Failing open matters: a missing list must hide nothing rather than
  // hide everything or break the archive.
  assert.match(app, /\.catch\(\(\) => new Map\(\)\)/, 'a missing list must hide nothing');
  // The collapsed entry must still say where to read it.
  assert.match(app, /still in the index[\s\S]{0,80}still on chain/,
    'a collapsed entry must say it is still there');
});

// A collapse is an act by people. Hiding an entry without saying who did
// it, when, and why would make the archive's own moderation the one thing
// in it that leaves no record.
test('a collapsed entry shows who collapsed it, when, and on what grounds', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function collapseNote'), app.indexOf('function renderEntry'));
  for (const field of ['decided', 'by', 'reason', 'decision', 'ratified']) {
    assert.ok(fn.includes(field), `the collapse note must carry ${field}`);
  }
  // An emergency collapse is visible as such until a vote confirms it.
  assert.match(fn, /ratified === false[\s\S]{0,120}ratified/,
    'an unratified collapse must say so');
  // Legacy ids (a bare string) must still collapse, and must not pretend
  // a decision exists.
  assert.match(app, /typeof h === 'string'/, 'a bare id must still collapse');
  assert.match(fn, /no record of the decision attached/,
    'a collapse with no record must admit it');
});

// The schema is only useful if the file in the repository matches it.
test('hidden.json parses, documents its own schema, and is empty by default', () => {
  const j = JSON.parse(readFileSync(new URL('../hidden.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(j.hidden), 'hidden must be a list');
  for (const h of j.hidden) {
    if (typeof h === 'string') continue;
    for (const field of ['id', 'by', 'decided', 'reason', 'decision']) {
      assert.ok(h[field], `a collapse record needs ${field}`);
    }
  }
  assert.ok(/MODERATION\.md/.test(j.note), 'the note must point at the policy');
  assert.ok(j.schema, 'the file must describe its own fields');
});

// The dictionary is keyed by the English it replaces, so editing a
// sentence in index.html silently drops its translation and the passage
// reverts to English. Nothing throws; the page just quietly changes
// language in one paragraph. This is the test that notices.
test('every translation key still matches text in the page', () => {
  const dir = new URL('../web/', import.meta.url);
  const i18n = readFileSync(new URL('i18n.js', dir), 'utf8');
  // Keys are the page's *text*, so the comparison has to be against text:
  // inline markup inside a sentence (<b>500</b>, <code>esip6</code>) is
  // not part of the key the runtime builds from textContent.
  const files = ['index.html', 'app.js'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  // Text with the markup removed, plus the raw file, since some strings
  // live in an attribute (a placeholder) rather than in the text.
  const haystack = (files.replace(/<[^>]+>/g, '') + '\n' + files)
    .replace(/&#10;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

  // Keys are the quoted left-hand sides of the ZH table.
  // The keys are JavaScript literals: an escape in the source is one
  // character at runtime, which is what the page will match against.
  const keys = [...i18n.matchAll(/^\s{4}'((?:[^'\\]|\\.)+)':/gm)]
    .map((m) => m[1].replace(/\\'/g, "'").replace(/\\n/g, ' '));
  assert.ok(keys.length > 30, `expected a full dictionary, found ${keys.length}`);

  const missing = keys.filter((k) => !haystack.includes(k.replace(/\s+/g, ' ')));
  assert.deepEqual(missing, [], 'these translations no longer match anything in the page');
});

// Entries are what someone wrote. Translating one would be editing it.
test('the translator never touches an entry body', () => {
  const i18n = readFileSync(new URL('../web/i18n.js', import.meta.url), 'utf8');
  assert.match(i18n, /SKIP\s*=\s*new Set\(\[[^\]]*'PRE'/, 'preview text must be skipped');
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  // The body is rendered escaped into its own element and never passed
  // through T().
  assert.match(app, /class="entry-body">\$\{esc\(e\.body\)\}/, 'an entry body must be rendered raw and escaped');
  assert.ok(!/T\(\s*e\.body/.test(app), 'an entry body must never be translated');
});

// A browser that refuses storage still has to render.
test('the language choice degrades without localStorage', () => {
  const i18n = readFileSync(new URL('../web/i18n.js', import.meta.url), 'utf8');
  assert.match(i18n, /try\s*\{\s*return localStorage\.getItem/, 'reads must be guarded');
  assert.match(i18n, /try\s*\{\s*localStorage\.setItem/, 'writes must be guarded');
  assert.match(i18n, /navigator\.language/, 'a first visit should follow the browser');
});

// A link pasted into a chat or a forum is a card, not a URL. Without
// these the project arrives as a bare line of text, and the page's own
// tab shows a blank icon.
test('the page carries an icon and a shareable card', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const needle of [
    'rel="icon" href="favicon.svg"', 'apple-touch-icon',
    'og:title', 'og:description', 'og:image', 'og:url',
    'twitter:card',
  ]) assert.ok(html.includes(needle), `missing ${needle}`);

  // Crawlers do not resolve relative image paths reliably.
  const img = html.match(/property="og:image" content="([^"]+)"/)[1];
  assert.match(img, /^https:\/\//, 'og:image must be absolute');
});

// Every file the page asks for has to be in the published site, or the
// icon is a 404 that nobody notices until a tab looks wrong.
test('build-site publishes the icons and the card', () => {
  const build = readFileSync(new URL('../scripts/build-site.mjs', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const assets = [...html.matchAll(/(?:href|src|content)="(?:https:\/\/indelebile\.xyz\/)?((?:favicon|mark|icon-|og)[\w.-]+)"/g)]
    .map((m) => m[1]);
  assert.ok(assets.length >= 4, `expected the icon set, found ${assets.join(', ')}`);
  for (const a of new Set(assets)) assert.ok(build.includes(`'${a}'`), `build-site does not copy ${a}`);
});

// The icon in the tab and the mark beside the title are two files drawn by
// one script. They may differ in exactly one way — the softened sheet —
// and a hand edit to either would make them two marks.
test('the title mark and the favicon are the same drawing', () => {
  const read = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');
  const rects = (svg) => [...svg.matchAll(/<rect [^>]+>/g)].map((m) => m[0]);
  const [fav, mark] = [rects(read('favicon.svg')), rects(read('mark.svg'))];
  assert.equal(fav.length, mark.length, 'same number of shapes');
  assert.deepEqual(fav.slice(1), mark.slice(1), 'everything but the sheet must match');
  assert.ok(!/fill-opacity/.test(fav[0]), 'the favicon sheet must be opaque');
  assert.match(mark[0], /fill-opacity="0\.9"/, 'the title mark sheet is softened');
});

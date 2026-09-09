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
  for (const k of ['SEL', 'TOPIC', 'encodeWriteEntry', 'encodeBalanceOf',
                   'decodeEsip3String', 'padAddr', 'utf8Hex']) {
    assert.ok(abi[k], `missing export: ${k}`);
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

test('log topic matches the ESIP-3 event signature', () => {
  const abi = loadAbiJs();
  assert.equal(abi.TOPIC.esip3,
    '0x665fba0baf3dc33e9943340197893ac16f56482c2defb8de60f944987fee451c');
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

// Three sections of background reading were sharing one cramped strip.
// They are tabs now, which means the markup has wiring that can silently
// come apart: a tab whose panel was renamed just does nothing.
test('every tab points at a panel that exists, and exactly one starts open', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const tabs = [...html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"[^>]*aria-selected="(true|false)"/g)];
  assert.ok(tabs.length >= 2, 'expected a tab strip');

  for (const [, panel] of tabs) {
    assert.ok(html.includes(`id="${panel}"`), `tab points at missing panel: ${panel}`);
    assert.ok(html.includes(`role="tabpanel" aria-labelledby=`), 'panels need tabpanel roles');
  }
  const open = tabs.filter(([, , sel]) => sel === 'true');
  assert.equal(open.length, 1, 'exactly one tab must start selected');

  // The one that starts selected is the one whose panel is not hidden.
  const openPanel = open[0][1];
  const panelTag = html.match(new RegExp(`<div class="panel" id="${openPanel}"[^>]*>`))[0];
  assert.ok(!panelTag.includes('hidden'), `${openPanel} is selected but hidden`);
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

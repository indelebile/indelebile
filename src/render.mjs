#!/usr/bin/env node
// Renders out/index.json into a single self-contained HTML file. Inlining
// the data matters: the page must open from a plain file:// path with no
// server, so a reviewer can verify the demo without trusting our hosting.
//
//   node src/render.mjs [--hidden hidden.json]
//
// Moderation is a display-layer overlay and nothing else. Hidden entries
// stay in the index and stay on L1; the page collapses them and says so.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { estimateGas, encode, buildEntry } from './entry.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const idxPath = new URL('../out/index.json', import.meta.url);
const index = JSON.parse(readFileSync(idxPath, 'utf8'));
const hiddenPath = arg('hidden');
const hidden = new Set(
  hiddenPath && existsSync(hiddenPath) ? JSON.parse(readFileSync(hiddenPath, 'utf8')).hidden ?? [] : [],
);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const when = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

const rows = index.entries.map((e) => {
  const gas = estimateGas(encode(buildEntry(e)).calldata).gas;
  const isHidden = hidden.has(e.id);
  return `<article class="entry${isHidden ? ' hidden' : ''}" data-tags="${esc(e.tags.join(' '))}">
  <header>
    <a class="who" href="https://etherscan.io/address/${esc(e.author)}">${esc(short(e.author))}</a>
    <span class="seq">#${e.seq}</span>
    <time>${when(e.ts)}</time>
    <a class="tx" href="https://etherscan.io/tx/${esc(e.id)}">block ${e.block}</a>
  </header>
  ${isHidden
    ? `<p class="veil">Hidden by governance vote. The entry remains on-chain and in the
       index — <a href="https://etherscan.io/tx/${esc(e.id)}">read it from calldata</a>.</p>`
    : `<p class="body">${esc(e.body)}</p>`}
  <footer>
    ${e.tags.map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
    <span class="gas">${gas.toLocaleString()} gas</span>
  </footer>
</article>`;
}).join('\n');

const html = `<title>Justice Journal</title>
<style>
:root{--bg:#faf9f7;--fg:#1a1a1a;--dim:#6b6b6b;--line:#e2e0dc;--card:#fff;--accent:#8b1e1e}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){
  --bg:#141311;--fg:#eae8e4;--dim:#918d86;--line:#2c2a27;--card:#1c1b19;--accent:#d97070}}
:root[data-theme=dark]{--bg:#141311;--fg:#eae8e4;--dim:#918d86;--line:#2c2a27;--card:#1c1b19;--accent:#d97070}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);margin:0;padding:2rem 1rem;
  font:16px/1.65 Georgia,'Songti SC','Noto Serif CJK SC',serif}
main{max-width:44rem;margin:0 auto}
h1{font-size:1.6rem;margin:0 0 .3rem;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:.85rem;margin:0 0 2rem;font-family:ui-monospace,monospace}
.entry{background:var(--card);border:1px solid var(--line);border-radius:6px;
  padding:1.1rem 1.3rem;margin-bottom:1rem}
.entry header{display:flex;gap:.75rem;align-items:baseline;flex-wrap:wrap;
  font-family:ui-monospace,monospace;font-size:.75rem;color:var(--dim);margin-bottom:.6rem}
.entry a{color:var(--dim);text-decoration:none;border-bottom:1px solid var(--line)}
.entry a:hover{color:var(--accent)}
.who{color:var(--fg)!important}
.seq{color:var(--accent)}
.body{margin:0;white-space:pre-wrap;word-break:break-word}
.veil{margin:0;color:var(--dim);font-style:italic;font-size:.9rem}
.entry footer{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-top:.8rem}
.tag{background:none;border:1px solid var(--line);color:var(--dim);border-radius:99px;
  padding:.1rem .55rem;font:inherit;font-size:.72rem;cursor:pointer}
.tag:hover{border-color:var(--accent);color:var(--accent)}
.gas{margin-left:auto;color:var(--dim);font-family:ui-monospace,monospace;font-size:.7rem}
#filter{margin-bottom:1rem;font-family:ui-monospace,monospace;font-size:.8rem;color:var(--dim)}
#filter button{background:none;border:0;color:var(--accent);cursor:pointer;font:inherit}
.entry[hidden]{display:none}
</style>
<main>
<h1>Justice Journal</h1>
<p class="sub">${index.entries.length} entries · blocks ${index.range.from}–${index.range.to} ·
  ${index.rejected.length} rejected · content lives in L1 calldata, not IPFS</p>
<p id="filter" hidden>filtering <b id="ftag"></b> — <button id="clear">show all</button></p>
${rows || '<p class="sub">No entries yet.</p>'}
</main>
<script>
const bar=document.getElementById('filter'),lbl=document.getElementById('ftag');
document.addEventListener('click',(ev)=>{
  const t=ev.target.closest('.tag'); if(!t) return;
  const tag=t.dataset.tag; lbl.textContent=tag; bar.hidden=false;
  for(const e of document.querySelectorAll('.entry'))
    e.hidden=!e.dataset.tags.split(' ').includes(tag);
});
document.getElementById('clear').onclick=()=>{
  bar.hidden=true; for(const e of document.querySelectorAll('.entry')) e.hidden=false;
};
</script>`;

writeFileSync(new URL('../out/journal.html', import.meta.url), html);
console.error(`wrote out/journal.html (${index.entries.length} entries, ${hidden.size} hidden)`);

// Indelebile — write page.
//
// Loads no libraries. The canonical entry form is imported from the same
// file the indexer uses (../src/canonical.mjs), so the bytes this page
// sends and the bytes the indexer expects cannot drift apart.

import { buildEntry, toDataUri, entryTail, codePointLength, byteLength, checkLocal }
  from '../src/canonical.mjs';

const C = window.JJ_CONFIG;
const { SEL, encodeWriteEntry, encodeBalanceOf } = window.JJ_ABI;

const $ = (id) => document.getElementById(id);

// Toggle a state class without touching the element's base class.
// Assigning `.className` outright drops it, the element loses its styling,
// and nothing anywhere reports an error — so we never assign it.
function setState(el, states, active) {
  for (const s of states) el.classList.toggle(s, s === active);
}
const eth = () => window.ethereum;

// Writing needs the wallet. Reading must not: a public archive that
// demands a wallet connection to be read would defeat its own purpose.
const wallet = (method, params = []) => eth().request({ method, params });

let readId = 0;
let workingRpc = null;  // remember the one that answered

async function callRpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++readId, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

/// The few chain reads that remain — a balance, a gas estimate, a receipt —
/// are about the transaction being written, so they go through the wallet
/// that is about to sign it. Only when no wallet is present do they fall
/// through the configured endpoints. Reading the archive needs neither.
async function read(method, params = []) {
  if (eth() && account) return wallet(method, params);

  const list = C.READ_RPCS ?? (C.READ_RPC ? [C.READ_RPC] : []);
  if (!list.length) return wallet(method, params);
  const ordered = workingRpc ? [workingRpc, ...list.filter((u) => u !== workingRpc)] : list;
  let last;
  for (const url of ordered) {
    try {
      const r = await callRpc(url, method, params);
      workingRpc = url;
      return r;
    } catch (e) { last = e; }
  }
  throw new Error(`no RPC endpoint would answer ${method}: ${last?.message ?? 'unknown'}`);
}

// Interface strings only. A missing translation returns the English,
// which is why nothing here can blank out.
const T = (s) => window.JJ_I18N?.t(s) ?? s;

let account = null;
let nextSeq = 0;

// ---------- wallet ----------

// Wallets fail quietly in several ways — a rejected prompt, a request
// already queued behind an unopened popup, an unknown network. None of
// them throws anywhere visible, so every one is caught and named here.
async function connect() {
  const btn = $('connect');
  if (!eth()) return noWallet();

  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Check your wallet…';
  say(T('Approve the connection in your wallet. If no window opened, click the wallet extension — the request may be waiting there.'));

  try {
    const [a] = await wallet('eth_requestAccounts');
    account = a.toLowerCase();

    if (Number(await wallet('eth_chainId')) !== C.CHAIN_ID) {
      const switched = await switchNetwork();
      if (!switched) return;
    }

    btn.hidden = true;
    $('walletInfo').hidden = false;
    $('notConnected').hidden = true;
    $('who').textContent = account.slice(0, 6) + '…' + account.slice(-4);
    if (!$('esAddr').value) $('esAddr').value = account;
    $('status').hidden = true;
    await refresh();
  } catch (e) {
    account = null;
    say(walletError(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/// Offer to switch, and to add the network if the wallet has never seen it.
async function switchNetwork() {
  try {
    await wallet('wallet_switchEthereumChain', [{ chainId: '0x' + C.CHAIN_ID.toString(16) }]);
    return true;
  } catch (e) {
    // 4902: the wallet does not know this chain yet.
    if (e.code === 4902 && C.CHAIN_PARAMS) {
      try {
        await wallet('wallet_addEthereumChain', [C.CHAIN_PARAMS]);
        return true;
      } catch (addErr) {
        say(`This page is on ${C.CHAIN_NAME}. ` + walletError(addErr), true);
        return false;
      }
    }
    say(`This page is on ${C.CHAIN_NAME} (chain ${C.CHAIN_ID}). ` + walletError(e), true);
    return false;
  }
}

function walletError(e) {
  const code = e?.code;
  if (code === 4001) return 'You declined the request in your wallet.';
  if (code === -32002) return 'Your wallet already has a request open — click the extension icon and approve it there. Wallets do not open a second window while one is pending.';
  if (code === 4900 || code === 4901) return 'Your wallet is locked or disconnected. Unlock it and try again.';
  return e?.data?.message || e?.message || 'Your wallet rejected the request.';
}

function noWallet() {
  const btn = $('connect');
  btn.disabled = true;
  btn.textContent = T('No wallet detected');
  $('notConnected').innerHTML = T('no wallet detected — install MetaMask or open this page in a wallet browser. You can still draft and read.')
    .replace('MetaMask', '<a href="https://metamask.io" target="_blank" rel="noreferrer">MetaMask</a>');
  say(T('This page found no wallet extension. Reading the archive works without one; writing does not.'), true);
}

async function refresh() {
  const balance = await callBalance();
  const held = balance / 10n ** 18n;
  const ok = balance >= C.MIN_BALANCE;
  $('gate').textContent = `${held.toLocaleString()} $JUSTICE`;
  setState($('gate'), ['yes', 'no'], ok ? 'yes' : 'no');
  $('gateNote').textContent = ok ? T('gate cleared')
    : `need ${(C.MIN_BALANCE / 10n ** 18n).toLocaleString()}`;
  $('faucet').hidden = !C.FAUCET || ok;

  nextSeq = await loadNextSeq();
  $('seq').textContent = nextSeq;
  update();
  renderFeed();
}

async function callBalance() {
  const r = await read('eth_call', [{ to: C.JUSTICE, data: encodeBalanceOf(account) }, 'latest']);
  return BigInt(r);
}

// Sequence numbers are not stored on-chain — they live in the entries, so
// the archive is the place to read them from, same as everything else.
async function loadNextSeq() {
  const idx = archive ?? await loadArchive().catch(() => null);
  if (!idx) return 0;
  const mine = idx.entries.filter((e) => e.author?.toLowerCase() === account);
  return mine.length ? Math.max(...mine.map((e) => e.seq)) + 1 : 0;
}

// ---------- signing on Etherscan instead ----------

// Someone who would rather not sign through this page can sign on
// Etherscan's own Write Contract tab. What they paste there has to be the
// exact tail the contract expects: the contract takes a malformed one and
// the fee with it, and the indexer then rejects the entry. So the argument
// is built here by the same functions the page itself sends with, and only
// the signing moves.
//
// The address matters because the contract writes msg.sender in as the
// author, and the entry number is per author. Built for one address and
// signed from another, the entry fails V6 and the fee is gone.

const isAddress = (a) => /^0x[0-9a-f]{40}$/.test(a);

function nextSeqFor(address) {
  const mine = (archive?.entries ?? []).filter((e) => e.author?.toLowerCase() === address);
  return mine.length ? Math.max(...mine.map((e) => e.seq)) + 1 : 0;
}

async function copyForEtherscan() {
  const msg = $('esMsg');
  const bad = (text) => { msg.textContent = text; setState(msg, ['bad'], 'bad'); $('esDone').hidden = true; };
  setState(msg, ['bad'], null);

  const address = $('esAddr').value.trim().toLowerCase();
  if (!isAddress(address)) return bad(T('That is not an Ethereum address.'));
  if (!archive) await loadArchive().catch(() => null);
  if (!archive) return bad(T('The archive could not be read, so the entry number is unknown. Try again.'));

  const tags = $('tags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const entry = buildEntry({
    author: address, seq: nextSeqFor(address), ts: Math.floor(Date.now() / 1000),
    tags, body: $('body').value, p: C.PROTOCOL,
  });
  const failed = checkLocal(entry, { bodyMaxChars: C.BODY_MAX_CHARS, maxTags: C.MAX_TAGS, protocol: C.PROTOCOL });
  if (failed.length) return bad(T('Fix the draft first:') + ' ' + $('problems').textContent);

  const tail = entryTail(entry);

  // Etherscan's form evaluates what is pasted as a JavaScript string, which
  // strips one level of backslash escaping. JSON writes line breaks, straight
  // double quotes and backslashes with exactly those escapes, so an entry
  // holding any of them would reach the contract altered: fee taken, entry
  // then rejected by the archive. (Found by running Etherscan's own
  // setupInputData and encodeParams on its own page.) A tail with no
  // backslash in it gives that nothing to act on, whatever Etherscan does
  // later — so that is the condition, rather than pre-escaping the argument
  // to suit how the form happens to behave today.
  if (tail.includes('\\')) {
    return bad(T('This route cannot carry line breaks, straight double quotation marks or backslashes: Etherscan’s form rewrites them, and the fee would be spent on an entry the archive rejects. Remove them here, or write from this page instead.'));
  }
  $('esOut').value = tail;

  // Built here rather than in the HTML: each step carries a live value,
  // and is translated as a whole before the value goes in.
  const link = `<a href="${C.EXPLORER}/address/${C.JOURNALS.at(-1).address}#writeContract" target="_blank" rel="noreferrer">${T('Write Contract')}</a>`;
  const who = `<b class="mono">${address.slice(0, 6)}…${address.slice(-4)}</b>`;
  const fee = `<b>${fmtEth(C.MIN_FEE_WEI)}</b>`;
  $('esSteps').innerHTML = [
    T('Open the contract’s {link} tab on Etherscan and connect {who} there.').replace('{link}', link).replace('{who}', who),
    T('Under {fn}, set {amount} to {fee} and paste the text below into {arg}.')
      .replace('{fn}', '<code>writeEntry</code>').replace('{amount}', '<code>payableAmount</code>')
      .replace('{fee}', fee).replace('{arg}', '<code>entryTail</code>'),
    T('Sign on Etherscan. If you write anything else from this address first, copy again.'),
  ].map((li) => `<li>${li}</li>`).join('');
  $('esDone').hidden = false;

  let copied = false;
  try { await navigator.clipboard.writeText(tail); copied = true; } catch { /* shown below to copy by hand */ }
  msg.textContent = (copied ? T('Copied.') : T('Copy the text below by hand.')) + ' '
    + T('This will be entry #{n} from this address.').replace('{n}', entry.seq);

  // A write from an address under the holding gate reverts. That costs
  // only gas, but it is better said before than discovered after.
  try {
    const held = BigInt(await read('eth_call', [{ to: C.JUSTICE, data: encodeBalanceOf(address) }, 'latest']));
    if (held < C.MIN_BALANCE) {
      bad(T('This address holds less than the $JUSTICE needed to write. The transaction would revert, costing gas.'));
      $('esDone').hidden = false;
    }
  } catch { /* the balance is a courtesy check; the contract enforces it regardless */ }
}

// ---------- composing ----------

function currentEntry() {
  const tags = $('tags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return buildEntry({
    author: account ?? '0x' + '0'.repeat(40),
    seq: nextSeq,
    ts: Math.floor(Date.now() / 1000),
    tags,
    body: $('body').value,
    p: C.PROTOCOL,
  });
}

function update() {
  const entry = currentEntry();
  const chars = codePointLength(entry.body);
  const uri = toDataUri(entry);

  $('count').textContent = `${chars} / ${C.BODY_MAX_CHARS}`;
  setState($('count'), ['over'], chars > C.BODY_MAX_CHARS ? 'over' : null);
  $('bytes').textContent = `${byteLength(uri)} bytes on-chain`;
  $('preview').textContent = uri;

  const pct = Math.min(100, (chars / C.BODY_MAX_CHARS) * 100);
  const bar = $('meterbar');
  bar.style.width = pct + '%';
  setState(bar, ['warn', 'over'], chars > C.BODY_MAX_CHARS ? 'over' : pct > 85 ? 'warn' : null);

  const failed = checkLocal(entry, {
    bodyMaxChars: C.BODY_MAX_CHARS, maxTags: C.MAX_TAGS, protocol: C.PROTOCOL,
  });
  const explain = {
    V5: 'malformed protocol fields',
    V8: 'bad sequence number',
    V10: chars === 0 ? 'write something first' : `body is over ${C.BODY_MAX_CHARS} characters`,
    V11: `tags must be lowercase letters, digits or hyphens, at most ${C.MAX_TAGS}`,
  };
  // Drafting needs no wallet — only sending does. Say which is missing
  // rather than leaving a dead button with no explanation.
  const notes = failed.map((f) => explain[f] ?? f);
  if (!account && chars > 0 && !failed.length) notes.push('connect a wallet to send');
  $('problems').textContent = notes.join(' · ');
  $('send').disabled = failed.length > 0 || !account;
  return { entry, uri, failed };
}

// ---------- sending ----------

async function send() {
  const { entry, failed } = update();
  // The fee is spent even if the indexer rejects the entry, so never send
  // something we already know is invalid.
  if (failed.length) return say('Entry is not valid yet — fix it before sending.', true);

  const tx = {
    from: account,
    to: C.JOURNALS.at(-1).address,
    value: '0x' + C.MIN_FEE_WEI.toString(16),
    data: '0x' + encodeWriteEntry(entryTail(entry)).replace(/^0x/, ''),
  };

  let gas;
  try {
    gas = BigInt(await read('eth_estimateGas', [tx]));
  } catch (e) {
    return say('Simulation failed: ' + (e.data?.message ?? e.message), true);
  }
  tx.gas = '0x' + (gas * 12n / 10n).toString(16);

  say(`About ${gas.toLocaleString()} gas plus a ${fmtEth(C.MIN_FEE_WEI)} ETH fee. Confirm in your wallet.`);
  $('send').disabled = true;
  try {
    const hash = await wallet('eth_sendTransaction', [tx]);
    const link = txLink(hash);

    // eth_sendTransaction returns as soon as the transaction is accepted,
    // not when it is mined. On a chain with real block times that is ten
    // seconds or more, so reloading the archive here would find nothing
    // and the entry would look lost.
    say(`Submitted — waiting for it to be mined. ${link}`, false, true);
    const receipt = await waitForReceipt(hash);

    if (!receipt) {
      say(`Still not mined after two minutes. It is probably fine — check ${link} and reload.`, true, true);
      $('send').disabled = false;
      return;
    }
    if (BigInt(receipt.status) === 0n) {
      say(`The transaction reverted, so nothing was written and the fee was not taken. ${link}`, true, true);
      $('send').disabled = false;
      return;
    }

    $('body').value = '';
    $('tags').value = '';
    // The archive below is the indexer's output, so a new entry appears
    // once the indexer next runs. Saying so beats silently omitting it.
    say(`Written in block ${Number(receipt.blockNumber)}. ${link}<br>` +
        'It will appear in the archive when the indexer next runs.', false, true);
    nextSeq += 1;
    $('seq').textContent = nextSeq;
  } catch (e) {
    say(walletError(e), true);
    $('send').disabled = false;
  }
}

const txLink = (hash) => C.EXPLORER
  ? `<a href="${C.EXPLORER}/tx/${hash}" target="_blank" rel="noreferrer">${hash.slice(0, 10)}…${hash.slice(-6)}</a>`
  : hash;

/// Poll until the transaction is mined. Returns null if it never is.
async function waitForReceipt(hash, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await read('eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) return r;
    const waited = Math.round((Date.now() - started) / 1000);
    say(`Submitted — waiting for it to be mined (${waited}s). ${txLink(hash)}`, false, true);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function faucet() {
  say('Claiming test tokens…');
  try {
    await wallet('eth_sendTransaction', [{ from: account, to: C.JUSTICE, data: SEL.faucet }]);
    say('Claimed. Refreshing balance…');
    setTimeout(refresh, 2000);
  } catch (e) { say(e.message, true); }
}

// ---------- reading ----------

// The archive comes from the indexer's output, not from the chain directly.
//
// The indexer is the thing that applies the rules; a page that queried
// eth_getLogs and filtered them itself would be a second implementation of
// those rules, free to drift from the first. It also made every reader
// depend on an endpoint willing to serve historical logs, which most free
// ones no longer are — the same shape of failure as an IPFS pin lapsing.
//
// Nothing is given up by reading a derived file: it is derived by rules
// anyone can re-run, and `entriesHash` is printed below so a reader can
// compare their own build against this one instead of trusting it.
let archive = null;
let hidden = new Map();

async function loadArchive() {
  const res = await fetch('../out/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`no index.json (HTTP ${res.status}) — run the indexer`);
  archive = await res.json();

  // Governance can collapse an entry here; it can never remove one. A
  // missing or unreadable list simply hides nothing — moderation failing
  // open is the right way for it to fail in an archive.
  hidden = await fetch('../hidden.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => parseHidden(j))
    .catch(() => new Map());

  return archive;
}

// A collapse is an act by people, so it carries who decided, when, under
// which clause, and where the decision can be read. An id with no record
// still collapses — a list that fails to parse would otherwise reveal
// everything it was meant to collapse — but it says so rather than
// implying a vote that may not exist.
function parseHidden(j) {
  const out = new Map();
  for (const h of j?.hidden ?? []) {
    if (typeof h === 'string') out.set(h, {});
    else if (h?.id) out.set(h.id, h);
  }
  return out;
}

// 'all' or 'mine'. An author's own entries are not a separate list: the
// archive already carries the author of every entry, so this is a filter
// over the same file, not a second source that could disagree with it.
let scope = 'all';

async function loadFeed() {
  await loadArchive();
  renderFeed();
}

function renderFeed() {
  const idx = archive;
  if (!idx) return;
  const all = idx.entries
    .map((e) => ({ ...e, tx: e.id }))
    .sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  const items = scope === 'mine'
    ? (account ? all.filter((e) => e.author?.toLowerCase() === account) : [])
    : all;

  $('feed').innerHTML = items.length ? items.map((e) => renderEntry(e)).join('') : emptyFeed();
  renderLatest(all);
  $('feedCount').textContent = all.length;
  $('feedNoun').textContent = T(all.length === 1 ? 'entry' : 'entries');
  $('sealCount').textContent = `${all.length} ${T(all.length === 1 ? 'entry kept' : 'entries kept')}`;
  $('asOf').textContent = idx.synthetic
    ? 'synthetic sample data — run the indexer for the real archive'
    : `as of block ${idx.builtAtBlock?.toLocaleString() ?? '—'}`;
  $('archiveHash').textContent = idx.entriesHash ?? '';

  // The count belongs on the tab rather than in the feed: it answers
  // "have I written anything" without having to switch to find out.
  const n = account ? all.filter((e) => e.author?.toLowerCase() === account).length : null;
  $('tab-mine').textContent = n === null ? T('Written by me') : `${T('Written by me')} (${n})`;

  // A tag filter applies to whatever is on screen; the feed was replaced,
  // so the filter has to be dropped with it.
  $('filterbar').hidden = true;

  // Last, after every label above has been written: the feed and the tab
  // text were just replaced, so whatever was translated in them is gone.
  // Entries themselves never match a key — they are what someone wrote.
  window.JJ_I18N?.apply(window.JJ_I18N.lang);
}

// The reading view: the newest few, for people who came to read rather
// than to write. It shows the same entries as the archive below the
// composer, from the same file, so the two cannot disagree; it only
// leaves out the tools. The rest is one click away and never paged —
// the whole archive is one small file.
const LATEST = 10;
let latestAll = false;
let latestTag = null;

function renderLatest(all) {
  if (!all.length) {
    $('latest').innerHTML = `<div class="empty"><b>${T('The archive is empty.')}</b>
      ${T('Nothing has been written here yet. Yours would be entry number one.')}</div>`;
    return;
  }
  // A tag means every entry carrying it, not only those among the newest.
  const items = latestTag ? all.filter((e) => (e.tags ?? []).includes(latestTag)) : all;
  const shown = latestAll || latestTag ? items : items.slice(0, LATEST);
  const more = shown.length < items.length
    ? `<p class="more"><button class="ghost small" id="latestAll">${
      T('Show all {n} entries').replace('{n}', items.length)}</button></p>`
    : '';
  $('latestTag').textContent = latestTag ?? '';
  $('latestFilter').hidden = !latestTag;
  $('latest').innerHTML = shown.map((e) => renderEntry(e)).join('') + more;
}

function emptyFeed() {
  if (scope !== 'mine') {
    return `<div class="empty"><b>${T('The archive is empty.')}</b>
      ${T('Nothing has been written here yet. Yours would be entry number one.')}</div>`;
  }
  if (!account) {
    return `<div class="empty"><b>${T('Connect a wallet to see what you have written.')}</b>
      ${T('Nothing is sent anywhere — this filters the same public archive by your address, in your browser.')}
      <button class="ghost small" id="feedConnect">${T('Connect wallet')}</button></div>`;
  }
  return `<div class="empty"><b>${T('You have not written anything yet.')}</b>
    ${T('Entries you write from this address will appear here.')}
    <span class="mono">${account.slice(0, 6)}…${account.slice(-4)}</span></div>`;
}

// Who did this, when, and on what grounds — shown on the entry itself, so
// the reader never has to take the collapse on trust. An emergency
// collapse that has not yet been ratified says so: that is the point of
// separating the act from the ratification.
function collapseNote(r, esc) {
  const when = r?.decided ? ` on ${esc(r.decided)}` : '';
  const by = r?.by ? ` by ${esc(r.by)}` : '';
  const why = r?.reason ? ` — ${esc(r.reason)}` : '';
  const pending = r?.ratified === false ? ' <b>Not yet ratified by a vote.</b>' : '';
  const where = r?.decision
    ? ` <a href="${esc(r.decision)}" target="_blank" rel="noreferrer">The decision</a>.`
    : '';
  if (!r || !Object.keys(r).length) {
    return 'Collapsed in this view, with no record of the decision attached.';
  }
  return `Collapsed${by}${when}${why}.${pending}${where}`;
}

function renderEntry(e) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = C.EXPLORER
    ? `<a href="${C.EXPLORER}/tx/${e.tx}" target="_blank" rel="noreferrer">block ${e.block}</a>`
    : `block ${e.block}`;
  const tags = (e.tags ?? []);
  const record = hidden.get(e.tx);
  const collapsed = record !== undefined;
  return `<article class="entry${collapsed ? ' collapsed' : ''}" data-tags="${esc(tags.join(' '))}" data-tx="${esc(e.tx)}">
    <div class="entry-meta">
      <span class="who">${esc(e.author.slice(0, 6))}…${esc(e.author.slice(-4))}</span>
      <span class="seq">entry #${esc(e.seq)}</span>
      <span>${new Date(e.ts * 1000).toISOString().slice(0, 10)}</span>
      ${link}
    </div>
    <div>
      ${collapsed
        ? `<p class="veil">${collapseNote(record, esc)} The entry is still in the index
           and still on chain — ${C.EXPLORER
             ? `<a href="${C.EXPLORER}/tx/${esc(e.tx)}" target="_blank" rel="noreferrer">read it from the calldata</a>`
             : 'read it from the calldata'}.</p>`
        : `<p class="entry-body">${esc(e.body)}</p>`}
      ${tags.length ? `<div class="entry-tags">${tags
        .map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    </div>
  </article>`;
}

// Tag filtering, delegated so it survives every re-render of the feed.
// Each view filters only itself, under its own bar: a tag clicked while
// reading must not quietly hide entries in the archive on the other tab.
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('.tag');
  if (!t) return;
  const tag = t.dataset.tag;
  if (t.closest('#latest')) {
    latestTag = tag;
    renderFeed();
    $('latestFilter').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  $('ftag').textContent = tag;
  $('filterbar').hidden = false;
  for (const el of document.querySelectorAll('#feed article.entry')) {
    el.hidden = !el.dataset.tags.split(' ').includes(tag);
  }
});

// ---------- misc ----------

const fmtEth = (wei) => (Number(wei) / 1e18).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
function say(msg, bad = false, html = false) {
  const el = $('status');
  el[html ? 'innerHTML' : 'textContent'] = msg;
  setState(el, ['ok', 'bad'], bad ? 'bad' : 'ok');
  el.hidden = false;
}

$('connect').onclick = connect;
$('esCopy').onclick = copyForEtherscan;
$('send').onclick = send;
$('faucet').onclick = faucet;
$('body').oninput = update;
$('tags').oninput = update;
$('reload').onclick = loadFeed;

// Tabs. Three sections of background reading were competing for the same
// strip at the foot of the page and none of them had room; one at a time
// gives each the width it needs.
for (const list of document.querySelectorAll('.tabs')) {
  const tabs = [...list.querySelectorAll('[role=tab]')];
  const selectTab = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      // A scope tab switches what the one feed shows; the others each own
      // a panel to reveal.
      if (!t.dataset.scope) document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (tab.dataset.scope) { scope = tab.dataset.scope; renderFeed(); }
    // Replaced rather than pushed: switching view is not a page to go
    // back to, but the address should still say where the reader is.
    if (tab.dataset.view) {
      history.replaceState(null, '', `#${tab.dataset.view}`);
      // The two buttons in the opening lead to the two views, so the filled
      // one is whichever view is open, never a fixed favourite.
      for (const a of document.querySelectorAll('.cta [data-view]')) {
        a.classList.toggle('solid', a.dataset.view === tab.dataset.view);
      }
    }
  };
  for (const [i, t] of tabs.entries()) {
    t.onclick = () => selectTab(t);
    t.onkeydown = (ev) => {
      const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
    };
  }
}

// The connect button inside an empty "written by me" feed is rendered and
// re-rendered with it, so the click is delegated rather than bound.
document.addEventListener('click', (ev) => {
  if (ev.target.id === 'feedConnect') connect();
  if (ev.target.id === 'latestAll') { latestAll = true; renderFeed(); }
});

// A link can open either view: #write for a post asking people to add
// to the record, #read (or nothing) for one pointing at what is in it.
const openView = () => {
  const tab = { '#write': 'tab-write', '#read': 'tab-read' }[location.hash];
  if (!tab) return;
  $(tab).click();
  $('views').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
openView();
window.addEventListener('hashchange', openView);

// Labels built here (the count on a tab, the show-all button) are written
// in whichever language was current at the time, so a language switch has
// to rebuild them. Deferred, so the switch has happened by then.
$('lang').addEventListener('click', () => setTimeout(renderFeed));

$('clearfilter').onclick = () => {
  $('filterbar').hidden = true;
  for (const el of document.querySelectorAll('#feed article.entry')) el.hidden = false;
};
$('latestClear').onclick = () => { latestTag = null; renderFeed(); };

$('chain').textContent = C.CHAIN_NAME;
$('fee').textContent = fmtEth(C.MIN_FEE_WEI);
$('gateReq').textContent = (C.MIN_BALANCE / 10n ** 18n).toLocaleString();
$('max').textContent = C.BODY_MAX_CHARS;
$('contractAddr').innerHTML = C.JOURNALS.map((j) => C.EXPLORER
  ? `<a href="${C.EXPLORER}/address/${j.address}" target="_blank" rel="noreferrer">${j.address}</a>`
  : j.address).join('<br>');
update();
loadFeed().catch(() => {
  $('feed').innerHTML = $('latest').innerHTML = '<p class="muted">Could not reach the network.</p>';
});

if (eth()) {
  eth().on?.('accountsChanged', () => location.reload());
  eth().on?.('chainChanged', () => location.reload());
} else {
  // Some wallets inject late. Give them a moment before saying there is none.
  window.addEventListener('eip6963:announceProvider', () => location.reload(), { once: true });
  setTimeout(() => { if (!eth()) noWallet(); }, 1200);
}

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
  const used = seqsOf(account);
  return used.length ? Math.max(...used) + 1 : 0;
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
  const used = seqsOf(address);
  return used.length ? Math.max(...used) + 1 : 0;
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
  $('bytes').textContent = T('{n} bytes on-chain').replace('{n}', byteLength(uri));
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

  // The same words again from the same address is almost always a second
  // press while the first was still waiting to appear, so ask first.
  const again = [...(archive?.entries ?? []), ...readPending()]
    .find((e) => e.author?.toLowerCase() === account && e.body === entry.body);
  if (again && !window.confirm(T('You have already written exactly this from this address. Write it again, paying the fee again?'))) {
    return;
  }

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

    rememberPending({ tx: hash, block: Number(receipt.blockNumber), author: account,
      seq: entry.seq, ts: entry.ts, tags: entry.tags, body: entry.body, at: Date.now() });
    $('body').value = '';
    $('tags').value = '';
    say(`${T('Written in block {b}.').replace('{b}', Number(receipt.blockNumber))} ${link}<br>` +
        T('It is shown under Read already, marked as waiting, and joins the archive at its next rebuild. There is no need to send it again.'),
    false, true);
    nextSeq = await loadNextSeq();
    $('seq').textContent = nextSeq;
    renderFeed();
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
let archiveAt = null;
let hidden = new Map();

async function loadArchive() {
  const res = await fetch('../out/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`no index.json (HTTP ${res.status}) — run the indexer`);
  archive = await res.json();
  // When this copy was published, so a reader can see how stale it is.
  const lm = Date.parse(res.headers.get('last-modified') ?? '');
  archiveAt = Number.isNaN(lm) ? null : lm;

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

// ---------- written here, not yet in the archive ----------
// The archive is rebuilt on a schedule that GitHub runs late as often as
// on time, so an entry can be on chain for an hour before it appears. A
// writer who sees nothing in that hour writes it again, and the second
// copy, carrying the same entry number, is refused while its fee is
// spent. So an entry written from this page is shown at once, marked as
// waiting, from this browser's own record of it. Nothing about it is
// decided here: it drops out the moment the archive includes it, and if
// the archive refuses it instead, it says so with the archive's reasons.
const PENDING_KEY = 'indelebile-pending';
const readPending = () => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]'); } catch { return []; }
};
const writePending = (list) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* private mode */ }
};
function rememberPending(p) {
  writePending([...readPending().filter((x) => x.tx !== p.tx), p]);
}
function pendingEntries(idx) {
  const inArchive = new Set(idx.entries.map((e) => e.id.toLowerCase()));
  const refused = new Map((idx.rejected ?? []).map((r) => [r.txHash.toLowerCase(), r.failed]));
  const fortnight = 14 * 86_400_000;
  const keep = readPending().filter((p) => !inArchive.has(p.tx.toLowerCase())
    && Date.now() - (p.at ?? 0) < fortnight);
  writePending(keep);
  return keep.map((p) => ({ ...p, id: p.tx, logIndex: Number.MAX_SAFE_INTEGER, pending: true,
    refused: refused.get(p.tx.toLowerCase()) ?? null }));
}
// The entry numbers an address has used: those in the archive, and those
// written from here that the archive has not yet refused.
function seqsOf(address) {
  const indexed = (archive?.entries ?? []).filter((e) => e.author?.toLowerCase() === address);
  const waiting = archive
    ? pendingEntries(archive).filter((p) => p.author === address && !p.refused)
    : [];
  return [...indexed, ...waiting].map((e) => e.seq);
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
  const all = idx.entries.map((e) => ({ ...e, tx: e.id }));
  // Shown, not counted: the counts below are the archive's own.
  const shown = [...pendingEntries(idx), ...all]
    .sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  const items = scope === 'mine'
    ? (account ? shown.filter((e) => e.author?.toLowerCase() === account) : [])
    : shown;

  $('feed').innerHTML = items.length ? items.map((e) => renderEntry(e)).join('') : emptyFeed();
  renderLatest(shown);
  $('feedCount').textContent = all.length;
  $('feedNoun').textContent = T(all.length === 1 ? 'entry' : 'entries');
  $('sealCount').textContent = `${all.length} ${T(all.length === 1 ? 'entry kept' : 'entries kept')}`;
  $('asOf').textContent = idx.synthetic
    ? 'synthetic sample data — run the indexer for the real archive'
    : `as of block ${idx.builtAtBlock?.toLocaleString() ?? '—'}`;
  $('readAsOf').textContent = archiveAt === null ? ''
    : T('The archive was last rebuilt {m} minutes ago. A new entry appears after the next rebuild.')
      .replace('{m}', Math.max(0, Math.round((Date.now() - archiveAt) / 60_000)));
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
  reveal();
}

// Brings the entry a link asked for into view. A tag or a search could be
// hiding it, and so could the cut to the newest few, so all three give way.
function reveal() {
  if (!wanted || !archive) return;
  const key = wanted;
  wanted = null;
  if (!latestEntries.some((e) => entryKey(e) === key)) {
    const [author, n] = key.split('/');
    const note = $('searchNote');
    note.textContent = T('There is no entry {id} in the archive. If it was written in the last hour, it appears after the next rebuild.')
      .replace('{id}', `${author.slice(0, 6)}…${author.slice(-4)} #${n}`);
    note.hidden = false;
    note.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  marked = key;
  latestAll = true;
  latestTag = null;
  $('q').value = '';
  renderLatest(latestEntries);
  window.JJ_I18N?.apply(window.JJ_I18N.lang);
  // Straight there, once the faces have loaded: a link opened from a chat
  // arrives while the page is still settling, and a smooth scroll begun
  // then is cut short by the layout moving under it.
  const el = document.querySelector(`#latest article[data-key="${key}"]`);
  document.fonts.ready.then(() => requestAnimationFrame(() => el?.scrollIntoView({ block: 'start' })));
}

// The reading view: the newest few, for people who came to read rather
// than to write. It shows the same entries as the archive below the
// composer, from the same file, so the two cannot disagree; it only
// leaves out the tools. The rest is one click away and never paged —
// the whole archive is one small file.
const LATEST = 10;
let latestAll = false;
let latestTag = null;
let latestEntries = [];

// An entry's own address on the page: its author and its number from that
// author, the pair the protocol already holds unique. #e/<author>/<n> opens
// the reading view on that entry, however far down the archive it is.
const entryKey = (e) => `${e.author.toLowerCase()}/${e.seq}`;
const keyFromHash = (hash) => {
  const m = /^#e\/(0x[0-9a-fA-F]{40})\/(\d+)$/.exec(hash);
  return m ? `${m[1].toLowerCase()}/${Number(m[2])}` : null;
};
// A tag has an address too: #tag/<tag> opens the reading view filtered to it.
const tagFromHash = (hash) => /^#tag\/([a-z0-9-]{1,32})$/.exec(hash)?.[1] ?? null;
// The entry a link asked for: `wanted` until it has been found and shown,
// `marked` for as long as it stays outlined.
let wanted = null;
let marked = null;

// Search runs over the archive file already in the browser: nothing is
// sent anywhere. It matches the text, a tag, or any part of the author's
// address. A collapsed entry is matched only on what the view still shows
// of it, its tags and author, so a search cannot surface what governance
// chose to fold away.
function matches(e, q) {
  const s = q.toLowerCase();
  const tag = s.replace(/^#/, '');
  if ((e.tags ?? []).some((t) => t.includes(tag))) return true;
  if (e.author?.toLowerCase().includes(s)) return true;
  return !hidden.has(e.tx) && e.body.toLowerCase().includes(s);
}

function renderLatest(all) {
  if (!all.length) {
    $('latest').innerHTML = `<div class="empty"><b>${T('The archive is empty.')}</b>
      ${T('Nothing has been written here yet. Yours would be entry number one.')}</div>`;
    return;
  }
  latestEntries = all;
  const q = $('q').value.trim();
  // A tag or a search means every entry that fits, not only the newest.
  let items = latestTag ? all.filter((e) => (e.tags ?? []).includes(latestTag)) : all;
  if (q) items = items.filter((e) => matches(e, q));
  const shown = latestAll || latestTag || q ? items : items.slice(0, LATEST);
  const more = shown.length < items.length
    ? `<p class="more"><button class="ghost small" id="latestAll">${
      T('Show all {n} entries').replace('{n}', items.length)}</button></p>`
    : '';
  $('latestTag').textContent = latestTag ?? '';
  $('latestFilter').hidden = !latestTag;
  if (latestTag) {
    $('latestLink').dataset.hash = `tag/${latestTag}`;
    $('latestLink').href = `#tag/${latestTag}`;
    $('latestLink').textContent = T('Copy link');
  }
  const note = $('searchNote');
  note.hidden = !q;
  note.textContent = !q ? ''
    : items.length === 0 ? T('Nothing in the record matches “{q}”.').replace('{q}', q)
      : T(items.length === 1 ? '1 entry matches “{q}”' : '{n} entries match “{q}”')
        .replace('{n}', items.length).replace('{q}', q);
  $('latest').innerHTML = shown.map((e) => renderEntry(e, q)).join('') + more;
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

function renderEntry(e, mark = '') {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = C.EXPLORER
    ? `<a href="${C.EXPLORER}/tx/${e.tx}" target="_blank" rel="noreferrer">${T('block {b}').replace('{b}', e.block)}</a>`
    : T('block {b}').replace('{b}', e.block);
  const tags = (e.tags ?? []);
  const record = e.pending ? undefined : hidden.get(e.tx);
  const collapsed = record !== undefined;
  const state = !e.pending ? ''
    : e.refused
      ? `<p class="pending-note refused">${esc(T('The archive did not accept this entry: {why}.').replace('{why}', e.refused.join(', ')))}</p>`
      : `<p class="pending-note">${esc(T('On chain in block {b}, shown from this browser until the archive next rebuilds.').replace('{b}', e.block))}</p>`;
  const key = entryKey(e);
  // Only an entry the archive holds has an address anyone else can open.
  const permalink = e.pending ? ''
    : `<a class="permalink" href="#e/${esc(key)}" data-hash="e/${esc(key)}">${T('Copy link')}</a>`;
  // A collapsed entry is not drawn: the picture would carry what the view folds away.
  const picture = e.pending || collapsed ? ''
    : `<a class="cardlink" href="#" data-key="${esc(key)}">${T('Save as image')}</a>`;
  return `<article class="entry${collapsed ? ' collapsed' : ''}${e.pending ? ' pending' : ''}${key === marked ? ' marked' : ''}" data-tags="${esc(tags.join(' '))}" data-tx="${esc(e.tx)}" data-key="${esc(key)}">
    <div class="entry-meta">
      <span class="who">${esc(e.author.slice(0, 6))}…${esc(e.author.slice(-4))}</span>
      <span class="seq">${esc(T('entry #{n}').replace('{n}', e.seq))}</span>
      <span>${new Date(e.ts * 1000).toISOString().slice(0, 10)}</span>
      ${link}
      ${permalink}
      ${picture}
    </div>
    <div>
      ${collapsed
        ? `<p class="veil">${collapseNote(record, esc)} The entry is still in the index
           and still on chain — ${C.EXPLORER
             ? `<a href="${C.EXPLORER}/tx/${esc(e.tx)}" target="_blank" rel="noreferrer">read it from the calldata</a>`
             : 'read it from the calldata'}.</p>`
        : `<p class="entry-body">${highlight(e.body, mark, esc)}</p>`}
      ${state}
      ${tags.length ? `<div class="entry-tags">${tags
        .map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    </div>
  </article>`;
}

// Marks every occurrence of the search in an entry. It works on the raw
// text and escapes each piece itself, so a search can never match inside
// an escape sequence ("amp" in "&amp;") or inject markup of its own.
function highlight(text, q, esc) {
  if (!q) return esc(text);
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let out = '';
  let at = 0;
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, at)) {
    out += esc(text.slice(at, i)) + `<mark>${esc(text.slice(i, i + q.length))}</mark>`;
    at = i + q.length;
  }
  return out + esc(text.slice(at));
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
    history.replaceState(null, '', `#tag/${tag}`);
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

// The older way to copy, for in-app browsers (WeChat's among them) that
// refuse the clipboard API but still honour a copy from a selection.
function copyByHand(text) {
  const t = document.createElement('textarea');
  t.value = text;
  t.setAttribute('readonly', '');
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.append(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* not supported */ }
  t.remove();
  return ok;
}

// Copying a link to an entry or a tag. The link is a real one, so it can
// also be opened or copied from the browser's own menu; a plain click copies
// it and puts it in the address bar rather than switching views.
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('a.permalink');
  if (!a) return;
  ev.preventDefault();
  const url = `${location.href.split('#')[0]}#${a.dataset.hash}`;
  history.replaceState(null, '', `#${a.dataset.hash}`);
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch { copied = copyByHand(url); }
  a.textContent = copied ? T('Link copied') : T('Link in the address bar');
  setTimeout(() => { a.textContent = T('Copy link'); }, 2000);
});

// ---------- an entry as a picture ----------
// For posting on X, where most of the DAO's conversation happens, and where
// a picture is read in the timeline but a link is not opened. The entry is
// drawn here, in this browser, in the page's own faces and colours; nothing
// is sent anywhere. It is drawn to the shapes X shows uncropped, landscape
// when the entry is short and portrait when it is long, with the type made
// smaller rather than any of the entry cut off.
const WIDE = '\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef';
const RUNS = new RegExp(`[${WIDE}]|\\s+|[^\\s${WIDE}]+`, 'g');
const CLOSERS = /^[，。、；：？！」』）》】〕…,.;:?!)\]]$/;

// Breaks text to a width the way a page would: Latin between words, Chinese
// between characters, closing punctuation never at the start of a line (the
// character before it goes down with it, as Chinese typesetting does, rather
// than the mark hanging past the margin), and a run too long for any line
// (an address, a hash) cut where it must be.
function wrapText(measure, text, width) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (let tok of para.match(RUNS) ?? []) {
      if (!line && /^\s+$/.test(tok)) continue;
      if (measure(line + tok) <= width) { line += tok; continue; }
      if (line && CLOSERS.test(tok)) {
        // Back past any closing marks already at the end, to the character
        // they close; that character and its marks start the next line.
        const chars = [...line];
        let k = chars.length - 1;
        while (k > 0 && CLOSERS.test(chars[k])) k--;
        if (k > 0 && new RegExp(`[${WIDE}]`).test(chars[k])) {
          lines.push(chars.slice(0, k).join(''));
          line = chars.slice(k).join('') + tok;
        } else {
          line += tok;
        }
        continue;
      }
      if (/^\s+$/.test(tok)) { lines.push(line.trimEnd()); line = ''; continue; }
      if (line) lines.push(line.trimEnd());
      while (measure(tok) > width && tok.length > 1) {
        let i = tok.length - 1;
        while (i > 1 && measure(tok.slice(0, i)) > width) i--;
        lines.push(tok.slice(0, i));
        tok = tok.slice(i);
      }
      line = tok;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// The two shapes, and the room each leaves around the entry.
const SHAPES = [
  { W: 1200, H: 675, pad: 64, head: 28, top: 136, foot: 150, sizes: [40, 38, 36, 34, 32] },
  { W: 1080, H: 1350, pad: 88, head: 32, top: 180, foot: 180, sizes: [42, 40, 38, 36, 34, 32, 30, 28, 26] },
];

// Picks the first shape and size at which the whole entry fits: landscape
// if it can, portrait otherwise, and, past the smallest portrait size, a
// portrait card made taller rather than an entry cut short.
// The height left for the entry between the heading and the footer rule.
const GAP = 24;
const room = (shape, H) => H - shape.top - shape.foot - GAP;

function planCard(measure, text, hasTags) {
  const tagRoom = hasTags ? 52 : 0;
  for (const shape of SHAPES) {
    for (const size of shape.sizes) {
      const lines = wrapText((t) => measure(size, t), text, shape.W - shape.pad * 2);
      const line = Math.round(size * 1.5);
      if (lines.length * line + tagRoom <= room(shape, shape.H)) return { ...shape, size, line, lines };
    }
  }
  const shape = SHAPES[1];
  const size = shape.sizes.at(-1);
  const line = Math.round(size * 1.5);
  const lines = wrapText((t) => measure(size, t), text, shape.W - shape.pad * 2);
  return { ...shape, size, line, lines, H: shape.top + lines.length * line + tagRoom + GAP + shape.foot };
}

async function drawCard(e) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const serif = v('--serif');
  const face = (size) => `400 ${size}px ${serif}`;
  await Promise.all([face(40), `500 32px Cinzel, ${serif}`, `italic 24px ${v('--serif-it')}`]
    .map((f) => document.fonts.load(f).catch(() => {})));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tags = (e.tags ?? []).map((t) => `#${t}`).join('   ');
  const plan = planCard((size, t) => { ctx.font = face(size); return ctx.measureText(t).width; }, e.body, !!tags);
  const { W, H, pad } = plan;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = v('--paper');
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = v('--rule');
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  ctx.fillStyle = v('--ink');
  ctx.font = `500 ${plan.head}px Cinzel, ${serif}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  ctx.fillText('INDELEBILE', pad, pad + plan.head * 0.9);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = v('--ink-3');
  ctx.font = `400 ${Math.round(plan.head * 0.78)}px ${v('--sans')}`;
  ctx.textAlign = 'right';
  ctx.fillText('indelebile.xyz', W - pad, pad + plan.head * 0.85);
  ctx.textAlign = 'left';

  ctx.fillStyle = v('--ink');
  ctx.font = face(plan.size);
  plan.lines.forEach((l, i) => ctx.fillText(l, pad, plan.top + i * plan.line + plan.size));
  if (tags) {
    ctx.fillStyle = v('--accent');
    ctx.font = `400 22px ${v('--mono')}`;
    ctx.fillText(tags, pad, plan.top + plan.lines.length * plan.line + plan.size + 30);
  }

  // The footer sits at the foot of the card, whatever the length above it.
  const rule = H - plan.foot;
  ctx.strokeStyle = v('--rule');
  ctx.beginPath();
  ctx.moveTo(pad, rule);
  ctx.lineTo(W - pad, rule);
  ctx.stroke();
  ctx.fillStyle = v('--ink-3');
  ctx.font = `400 22px ${v('--mono')}`;
  ctx.fillText([
    `${e.author.slice(0, 6)}…${e.author.slice(-4)}`,
    T('entry #{n}').replace('{n}', e.seq),
    new Date(e.ts * 1000).toISOString().slice(0, 10),
    T('block {b}').replace('{b}', e.block),
  ].join('  ·  '), pad, rule + 42);
  ctx.fillStyle = v('--ink-2');
  ctx.font = `italic 24px ${v('--serif-it')}`;
  ctx.fillText(T('Written into Ethereum calldata, owned by its author.'), pad, rule + 82);
  return canvas;
}

document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('a.cardlink');
  if (!a) return;
  ev.preventDefault();
  const e = latestEntries.find((x) => entryKey(x) === a.dataset.key);
  if (!e || e.pending || hidden.has(e.tx)) return;
  const url = (await drawCard(e)).toDataURL('image/png');
  $('cardImg').src = url;
  $('cardSave').href = url;
  $('cardSave').download = `indelebile-${e.author.slice(0, 6)}-${e.seq}.png`;
  // X's own compose page, filled with the entry's first line and its link;
  // the picture is attached there. Only a link: nothing of X's is loaded here.
  const first = e.body.split('\n').find((l) => l.trim())?.trim() ?? '';
  $('cardPost').href = 'https://x.com/intent/post?' + new URLSearchParams({
    text: first.length > 120 ? `${first.slice(0, 119)}…` : first,
    url: `${location.href.split('#')[0]}#e/${entryKey(e)}`,
  });
  $('cardDialog').showModal();
});
$('cardClose').onclick = () => $('cardDialog').close();

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
  const key = keyFromHash(location.hash);
  if (key) {
    $('tab-read').click();
    // Opening the tab rewrote the address to #read; the link stays the link.
    history.replaceState(null, '', `#e/${key}`);
    wanted = key;
    reveal();
    return;
  }
  const tag = tagFromHash(location.hash);
  if (tag) {
    $('tab-read').click();
    history.replaceState(null, '', `#tag/${tag}`);
    latestTag = tag;
    renderFeed();
    $('views').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
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
$('lang').addEventListener('click', () => setTimeout(() => { renderFeed(); update(); }));

$('clearfilter').onclick = () => {
  $('filterbar').hidden = true;
  for (const el of document.querySelectorAll('#feed article.entry')) el.hidden = false;
};
$('latestClear').onclick = () => { latestTag = null; history.replaceState(null, '', '#read'); renderFeed(); };
// The box sits beside both views, but its results are in the reading
// one, so a search brings that view forward.
const search = () => {
  if ($('panel-read').hidden) $('tab-read').click();
  renderLatest(latestEntries);
};
$('q').oninput = search;
$('q').onkeydown = (ev) => {
  if (ev.key === 'Escape') { $('q').value = ''; renderLatest(latestEntries); }
};
$('searchForm').onsubmit = (ev) => {
  ev.preventDefault();
  if (!$('q').value.trim()) { $('q').focus(); return; }
  search();
  $('searchNote').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

$('chain').textContent = C.CHAIN_NAME;
$('fee').textContent = fmtEth(C.MIN_FEE_WEI);
$('gateReq').textContent = (C.MIN_BALANCE / 10n ** 18n).toLocaleString();
$('max').textContent = C.BODY_MAX_CHARS;
$('contractAddr').innerHTML = C.JOURNALS.map((j) => C.EXPLORER
  ? `<a href="${C.EXPLORER}/address/${j.address}" target="_blank" rel="noreferrer">${j.address}</a>`
  : j.address).join('<br>');
update();
// The page's language is applied on DOMContentLoaded, after this module has
// run, so the composer's figures are written once more in that language.
document.addEventListener('DOMContentLoaded', update);
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

// Justice Journal — write page.
//
// Loads no libraries. The canonical entry form is imported from the same
// file the indexer uses (../src/canonical.mjs), so the bytes this page
// sends and the bytes the indexer expects cannot drift apart.

import { buildEntry, toDataUri, codePointLength, byteLength, checkLocal }
  from '../src/canonical.mjs';

const C = window.JJ_CONFIG;
const { SEL, TOPIC, encodeWrite, encodeBalanceOf, decodeEsip2String, padAddr } = window.JJ_ABI;

const $ = (id) => document.getElementById(id);
const eth = () => window.ethereum;

// Writing needs the wallet. Reading must not: a public archive that
// demands a wallet connection to be read would defeat its own purpose.
const wallet = (method, params = []) => eth().request({ method, params });

let readId = 0;
async function read(method, params = []) {
  if (!C.READ_RPC) return wallet(method, params);
  const res = await fetch(C.READ_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++readId, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

let account = null;
let nextSeq = 0;

// ---------- wallet ----------

async function connect() {
  if (!eth()) return say('No wallet found. Install MetaMask, or open this page in a wallet browser.', true);
  const [a] = await wallet('eth_requestAccounts');
  account = a.toLowerCase();

  const chainId = Number(await wallet('eth_chainId'));
  if (chainId !== C.CHAIN_ID) {
    return say(`Wrong network: connected to chain ${chainId}, this deployment is on ${C.CHAIN_ID} (${C.CHAIN_NAME}).`, true);
  }

  $('connect').hidden = true;
  $('walletInfo').hidden = false;
  $('who').textContent = account.slice(0, 6) + '…' + account.slice(-4);
  await refresh();
}

async function refresh() {
  const balance = await callBalance();
  const held = balance / 10n ** 18n;
  const ok = balance >= C.MIN_BALANCE;
  $('gate').textContent = `${held.toLocaleString()} $JUSTICE`;
  $('gate').className = ok ? 'ok' : 'bad';
  $('gateNote').textContent = ok ? 'holding gate cleared'
    : `need ${(C.MIN_BALANCE / 10n ** 18n).toLocaleString()} to write`;
  $('faucet').hidden = !C.FAUCET || ok;

  nextSeq = await loadNextSeq();
  $('seq').textContent = nextSeq;
  update();
}

async function callBalance() {
  const r = await read('eth_call', [{ to: C.JUSTICE, data: encodeBalanceOf(account) }, 'latest']);
  return BigInt(r);
}

// The author's seq is not stored on-chain — it lives in the entries
// themselves, so we read their past ESIP-2 logs and take the highest.
async function loadNextSeq() {
  const logs = await read('eth_getLogs', [{
    address: C.JOURNAL,
    topics: [TOPIC.esip2, '0x' + padAddr(account)],
    fromBlock: '0x' + C.GENESIS_BLOCK.toString(16),
    toBlock: 'latest',
  }]);
  let max = -1;
  for (const l of logs) {
    try {
      const uri = decodeEsip2String(l.data);
      const e = JSON.parse(uri.slice(uri.indexOf(',') + 1));
      if (Number.isInteger(e.seq) && e.seq > max) max = e.seq;
    } catch { /* not one of ours; the indexer will reject it too */ }
  }
  return max + 1;
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
  });
}

function update() {
  const entry = currentEntry();
  const chars = codePointLength(entry.body);
  const uri = toDataUri(entry);

  $('count').textContent = `${chars} / ${C.BODY_MAX_CHARS}`;
  $('count').className = chars > C.BODY_MAX_CHARS ? 'bad' : '';
  $('bytes').textContent = `${byteLength(uri)} bytes on-chain`;
  $('preview').textContent = uri;

  const failed = checkLocal(entry, { bodyMaxChars: C.BODY_MAX_CHARS, maxTags: C.MAX_TAGS });
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
  const { uri, failed } = update();
  // The fee is spent even if the indexer rejects the entry, so never send
  // something we already know is invalid.
  if (failed.length) return say('Entry is not valid yet — fix it before sending.', true);

  const tx = {
    from: account,
    to: C.JOURNAL,
    value: '0x' + C.MIN_FEE_WEI.toString(16),
    data: '0x' + encodeWrite(uri).replace(/^0x/, ''),
  };

  let gas;
  try {
    gas = BigInt(await read('eth_estimateGas', [tx]));
  } catch (e) {
    return say('Simulation failed: ' + (e.data?.message ?? e.message), true);
  }
  tx.gas = '0x' + (gas * 12n / 10n).toString(16);

  say(`Sending — about ${gas.toLocaleString()} gas plus a ${fmtEth(C.MIN_FEE_WEI)} ETH fee. Confirm in your wallet.`);
  $('send').disabled = true;
  try {
    const hash = await wallet('eth_sendTransaction', [tx]);
    const link = C.EXPLORER ? `<a href="${C.EXPLORER}/tx/${hash}" target="_blank" rel="noreferrer">${hash}</a>` : hash;
    say(`Written. ${link}`, false, true);
    $('body').value = '';
    $('tags').value = '';
    await refresh();
  } catch (e) {
    say(e.message ?? 'Rejected.', true);
    $('send').disabled = false;
  }
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

async function loadFeed() {
  const logs = await read('eth_getLogs', [{
    address: C.JOURNAL, topics: [TOPIC.esip2],
    fromBlock: '0x' + C.GENESIS_BLOCK.toString(16), toBlock: 'latest',
  }]);
  const items = [];
  for (const l of logs.reverse()) {
    try {
      const uri = decodeEsip2String(l.data);
      const e = JSON.parse(uri.slice(uri.indexOf(',') + 1));
      const owner = '0x' + l.topics[1].slice(26);
      // Mirrors V6: the body's author must be the ESIP-2 initialOwner.
      if (e.author?.toLowerCase() !== owner.toLowerCase()) continue;
      items.push({ ...e, tx: l.transactionHash, block: Number(l.blockNumber) });
    } catch { /* skip */ }
  }
  $('feed').innerHTML = items.length ? items.map(renderEntry).join('')
    : '<p class="muted">No entries yet. Write the first one.</p>';
  $('feedCount').textContent = items.length;
}

function renderEntry(e) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = C.EXPLORER ? `<a href="${C.EXPLORER}/tx/${e.tx}" target="_blank" rel="noreferrer">block ${e.block}</a>`
    : `block ${e.block}`;
  return `<article>
    <header>
      <span class="who">${esc(e.author.slice(0, 6))}…${esc(e.author.slice(-4))}</span>
      <span class="seq">#${esc(e.seq)}</span>
      <time>${new Date(e.ts * 1000).toISOString().slice(0, 10)}</time>
      ${link}
    </header>
    <p>${esc(e.body)}</p>
    <footer>${(e.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</footer>
  </article>`;
}

// ---------- misc ----------

const fmtEth = (wei) => (Number(wei) / 1e18).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
function say(msg, bad = false, html = false) {
  const el = $('status');
  el[html ? 'innerHTML' : 'textContent'] = msg;
  el.className = bad ? 'bad' : 'ok';
  el.hidden = false;
}

$('connect').onclick = connect;
$('send').onclick = send;
$('faucet').onclick = faucet;
$('body').oninput = update;
$('tags').oninput = update;
$('reload').onclick = loadFeed;

$('chain').textContent = C.CHAIN_NAME;
$('fee').textContent = fmtEth(C.MIN_FEE_WEI);
$('gateReq').textContent = (C.MIN_BALANCE / 10n ** 18n).toLocaleString();
$('max').textContent = C.BODY_MAX_CHARS;
update();
loadFeed().catch(() => { $('feed').innerHTML = '<p class="muted">Could not reach the network.</p>'; });

if (eth()) {
  eth().on?.('accountsChanged', () => location.reload());
  eth().on?.('chainChanged', () => location.reload());
}

// Chinese for the interface, keyed by the English it replaces.
//
// The English in index.html stays the source: a key that no longer
// matches simply leaves that passage in English rather than blanking it,
// and test/web.test.mjs fails when a key stops matching anything, so the
// drift is visible rather than silent.
//
// Entries are never translated. They are what someone wrote, and this
// page's job is to show that, not to interpret it.

(function () {
  const ZH = {
    // masthead and opening
    'Italian for indelible · a permanent record for AssangeDAO':
      'Indelebile，意大利语「不可磨灭」· 为 AssangeDAO 留存的永久记录',
    "Write what you want kept. It goes into Ethereum calldata and is minted as an ethscription you own — not a link, not a file on someone's server. There is nothing to renew, nothing to unpin, and no one who can quietly delete it.":
      // Written for Chinese readers rather than translated from the English.
      '有些时刻，值得被历史记住；而我们，正是书写历史的人。<br>在这里，每一次思想的碰撞与表达，都会化作一枚刻在以太坊 calldata 上的铭文。它不是一条网页链接，也不存放在任何一台服务器上；无需续费，永不失效。',
    'network': '网络',
    'ETH per entry': 'ETH / 条',
    '$JUSTICE to write': '$JUSTICE 门槛',
    'entries': '条记录',
    'entry': '条记录',

    // composer
    'Write an entry': '写下一条记录',
    'Draft freely — nothing leaves this page until you sign.':
      '随便写——在你签名之前，没有任何内容离开这个页面。',
    'Your entry — up to 500 characters, any language':
      '正文 — 最多 500 字，任何语言',
    'Tags — optional, comma separated, lowercase':
      '标签 — 可选，英文逗号分隔，小写',
    'The exact bytes that will be recorded': '查看将被写入的确切字节',
    // signing on Etherscan instead
    'Sign on Etherscan instead of this page': '不经过本页，改在 Etherscan 上签名',
    "Draft here, then sign on Etherscan's own page, so nothing from this page touches your wallet.":
      '在这里起草，然后到 Etherscan 自己的页面上签名——本页的任何代码都不会接触你的钱包。',
    'The argument has to be exact. The contract will accept a malformed one, and the fee with it, but the archive will not — so this page writes it for you rather than leaving it to be typed.':
      '参数必须分毫不差。格式错了，合约照样收下、费用照扣，但档案不会收录——所以由本页替你生成，而不是让你手动输入。',
    "This route takes a single paragraph with no straight double quotation marks — Etherscan's form rewrites both. Apostrophes and “curly” quotes are fine.":
      '这条路径只能写一段，且不能含英文直双引号（"）——Etherscan 的表单会改写这两者。撇号和中文引号“”不受影响。',
    'This route cannot carry line breaks, straight double quotation marks or backslashes: Etherscan’s form rewrites them, and the fee would be spent on an entry the archive rejects. Remove them here, or write from this page instead.':
      '这条路径无法承载换行、英文直双引号或反斜杠：Etherscan 的表单会改写它们，费用照扣但档案会拒收这条记录。请先在这里删掉它们，或者改为直接在本页写入。',
    'The address you will sign with': '你将用来签名的地址',
    'Your entry number depends on it. Connecting a wallet fills it in; nothing is signed.':
      '你的记录序号取决于这个地址。连接钱包会自动填入，不会要求签名。',
    'Copy the argument': '复制参数',
    'That is not an Ethereum address.': '这不是一个以太坊地址。',
    'The archive could not be read, so the entry number is unknown. Try again.':
      '读取档案失败，无法确定序号。请重试。',
    'Fix the draft first:': '请先修正草稿：',
    'Copied.': '已复制。',
    'Copy the text below by hand.': '请手动复制下方文本。',
    'This will be entry #{n} from this address.': '这将是该地址的第 #{n} 条记录。',
    'This address holds less than the $JUSTICE needed to write. The transaction would revert, costing gas.':
      '这个地址持有的 $JUSTICE 不足门槛。交易会被回退，只损失 gas。',
    'Write Contract': 'Write Contract',
    'Open the contract’s {link} tab on Etherscan and connect {who} there.':
      '在 Etherscan 打开合约的 {link} 标签页，并在那里连接 {who}。',
    'Under {fn}, set {amount} to {fee} and paste the text below into {arg}.':
      '在 {fn} 下，把 {amount} 填为 {fee}，并把下方文本粘贴到 {arg}。',
    'Sign on Etherscan. If you write anything else from this address first, copy again.':
      '在 Etherscan 上签名。如果在此之前你用这个地址写了别的记录，请重新复制。',
    // Placeholders are attributes, so they are translated separately —
    // and an example in the wrong language is worse than none.
    'March 10, 2024 — I joined my first rally.\n\nWrite the thing you would want someone to be able to read in twenty years.':
      '2024 年 3 月 10 日 —— 我参加了第一次声援集会。\n\n写下你希望二十年后仍有人能读到的那件事。',
    'assange, press-freedom': 'assange, press-freedom',
    'Wallet': '钱包',
    'not connected — you can still draft': '未连接 — 仍然可以起草',
    'Connect wallet': '连接钱包',
    'No wallet detected': '未检测到钱包',
    'no wallet detected — install MetaMask or open this page in a wallet browser. You can still draft and read.':
      '未检测到钱包 — 请安装 MetaMask，或在钱包自带的浏览器中打开本页。阅读和起草不受影响。',
    'This page found no wallet extension. Reading the archive works without one; writing does not.':
      '本页没有找到钱包插件。阅读档案不需要钱包，写入需要。',
    'Length': '长度',
    'Entry': '序号',
    'Write to chain': '写入链上',
    'write something first': '请先写点什么',
    'Get test $JUSTICE': '领取测试用 $JUSTICE',

    // the opening
    // Not a translation but an answer in kind: Du Fu, 偶题. A couplet,
    // because a single line set alone reads as unfinished in Chinese.
    'What is written here cannot be erased.': '文章千古事，<br>得失寸心知。',
    'Written once, kept for good.': '一经铭刻，永不磨灭。',
    'Read the record': '阅读记录',
    'the record': '记录',
    'entries kept': '条记录在案',
    'entry kept': '条记录在案',

    // the two views
    'Read': '阅读',
    'Write': '写入',
    'Latest entries': '最新记录',
    'The newest entries in the archive, as written on Ethereum by their authors.':
      '档案中最新的记录，由作者本人写入以太坊。',
    'Show all {n} entries': '显示全部 {n} 条记录',

    // archive
    'The archive': '档案',
    'The archive is empty.': '档案是空的。',
    'Nothing has been written here yet. Yours would be entry number one.':
      '这里还没有人写下任何东西。你的将是第一条。',
    'Connect a wallet to see what you have written.': '连接钱包，查看你写过的内容。',
    'Nothing is sent anywhere — this filters the same public archive by your address, in your browser.':
      '没有任何内容被发送到别处 — 这只是在你的浏览器里，按你的地址筛选同一份公开档案。',
    'You have not written anything yet.': '你还没有写过任何内容。',
    'Entries you write from this address will appear here.': '你用这个地址写下的记录会出现在这里。',
    'gate cleared': '已达门槛',
    'Approve the connection in your wallet. If no window opened, click the wallet extension — the request may be waiting there.':
      '请在钱包中确认连接。如果没有弹出窗口，请点击钱包插件图标——请求可能在那里等待。',
    'All entries': '全部记录',
    'Written by me': '我写的',
    'Reload': '刷新',
    'show all': '显示全部',

    // background tabs
    'Before you write': '写入之前',
    'Three things worth a minute: how it works, what it costs, and how to check any of it for yourself.':
      '三件值得花一分钟了解的事：它如何运作、要花多少钱，以及你如何自行核验每一项。',
    'How this works': '它如何运作',
    'What it costs': '要花多少钱',
    'Verify it yourself': '自行核验',

    'Your words live in calldata': '你的文字存在 calldata 里',
    'Not IPFS. An IPFS archive survives only while someone keeps paying to pin it; when the pin lapses, the chain holds a hash and nothing readable. Here the text itself is inside the Ethereum transaction.':
      '不是 IPFS。IPFS 上的档案只在有人持续付费固定时才存在；一旦停付，链上留下的只是一个哈希，没有任何可读内容。这里的文字本身就在以太坊交易内部。',
    'You own the entry, not the DAO': '记录属于你，不属于 DAO',
    "The Ethscriptions protocol makes a transaction's recipient the owner, so a naive design would hand every entry to the treasury. This contract uses ESIP-3 to name you as the initial owner instead.":
      'Ethscriptions 协议规定交易的接收方即为所有者，所以一个想当然的设计会把每一条记录都交给国库。本合约改用 ESIP-3，指定<strong>你</strong>为初始所有者。',
    'No one can take your content first': '没有人能抢先占走你的内容',
    'Ethscriptions are normally unique, so a bot could copy your text from the mempool and inscribe it before you. Entries carry rule=esip6, which opts out of that rule — a copy can never invalidate yours.':
      'Ethscriptions 默认全局唯一，因此机器人可以从内存池里抄走你的文字抢先铭刻。本协议的每条记录都带 <code>rule=esip6</code>，主动退出唯一性约束——抄袭者无法让你的记录失效。',
    'Nothing can be deleted, including by us': '没有东西能被删除，包括我们',
    'Governance can vote to collapse an entry in this view, and the page will say so and link to the raw calldata. The chain is the record; this page is only one way of reading it.':
      '治理可以投票把某条记录在本视图中折叠，页面会明确标出，并给出原始 calldata 的链接。链才是记录本身，本页只是阅读它的一种方式。',

    // cost table
    '113 characters, English': '113 字英文',
    '500 characters, Chinese': '500 字中文',
    'Gas only; the write fee is on top. These are calibrated against a real transaction rather than estimated.':
      '仅为 gas，写入费另计。数据来自一笔真实交易的实测，不是估算。',
    'Chinese costs more per character because UTF-8 spends three bytes on each one. The limit counts characters, not bytes, so every language gets the same room.':
      '中文每字更贵，因为 UTF-8 下一个汉字占三个字节。但长度上限按<em>字符</em>计算而非字节，所以每种语言的篇幅是一样的。',

    // verify
    'Re-run the indexer and you must get a byte-identical file. That property is the whole claim — please check it rather than trust it.':
      '重新运行索引器，你必须得到逐字节相同的文件。这个性质就是我们全部的主张——请动手核验，而不是选择相信。',
    'This page does not read the chain to show you the archive; it reads the file the indexer produced. Doing otherwise would put a second copy of the rules in the browser, free to drift from the first.':
      '本页不直接读链来显示档案，而是读取索引器产出的文件。否则浏览器里就会存在第二套规则，随时可能与第一套不一致。',
  };

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const DICT = {};
  for (const [k, v] of Object.entries(ZH)) DICT[norm(k)] = v;

  // Elements whose English is replaced keep it, so switching back is a
  // restore rather than a second translation table.
  const original = new WeakMap();

  const INLINE = new Set(['B', 'STRONG', 'EM', 'I', 'A', 'CODE', 'SPAN', 'SMALL']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'PRE', 'TEXTAREA', 'INPUT']);

  function translatable(el) {
    if (SKIP.has(el.tagName)) return false;
    // An element holding live values (a balance, a count) must not have
    // its children replaced wholesale.
    return [...el.children].every((c) => INLINE.has(c.tagName) && !c.id);
  }

  // A section heading carries its numeral in a child span. The numeral is
  // not part of the sentence, so it is taken off before matching and put
  // back afterwards — otherwise every heading would need two keys.
  function parts(el) {
    const n = el.querySelector(':scope > .n');
    const prefix = n ? n.outerHTML : '';
    const text = n ? norm(el.textContent.slice(n.textContent.length)) : norm(el.textContent);
    return { prefix, text };
  }

  // Placeholders live in an attribute, out of reach of the text walk.
  function placeholders(lang) {
    for (const el of document.querySelectorAll('[placeholder]')) {
      if (!original.has(el)) original.set(el, el.getAttribute('placeholder'));
      const en = original.get(el);
      const zh = DICT[norm(en)];
      el.setAttribute('placeholder', lang === 'zh' && zh !== undefined ? zh : en);
    }
  }

  function walk(el, lang) {
    for (const c of [...el.children]) {
      if (SKIP.has(c.tagName)) continue;
      const { prefix, text } = parts(c);
      const hit = translatable(c) && DICT[text] !== undefined;
      if (hit) {
        if (!original.has(c)) original.set(c, c.innerHTML);
        c.innerHTML = lang === 'zh' ? prefix + DICT[text] : original.get(c);
      } else if (original.has(c) && lang !== 'zh') {
        c.innerHTML = original.get(c);
      } else {
        walk(c, lang);
      }
    }
  }

  let current = 'en';
  function apply(lang) {
    current = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
    walk(document.body, lang);
    placeholders(lang);
    const btn = document.getElementById('lang');
    if (btn) btn.textContent = lang === 'zh' ? 'EN' : '中文';
  }

  // Storage is a convenience: a browser that refuses it still gets a
  // working page in the language its own settings imply.
  const remembered = () => {
    try { return localStorage.getItem('jj-lang'); } catch { return null; }
  };
  const remember = (l) => {
    try { localStorage.setItem('jj-lang', l); } catch { /* private mode */ }
  };

  window.JJ_I18N = {
    get lang() { return current; },
    apply,
    // For strings app.js builds at runtime.
    t: (s) => (current === 'zh' && DICT[norm(s)] !== undefined ? DICT[norm(s)] : s),
    keys: () => Object.keys(DICT),
  };

  document.addEventListener('DOMContentLoaded', () => {
    const start = remembered() ?? (navigator.language?.startsWith('zh') ? 'zh' : 'en');
    apply(start);
    const btn = document.getElementById('lang');
    if (btn) btn.onclick = () => { const next = current === 'zh' ? 'en' : 'zh'; remember(next); apply(next); };
  });
})();

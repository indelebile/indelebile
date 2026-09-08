#!/usr/bin/env node
// Tiny static server rooted at the project, so `web/app.js` can import
// `../src/canonical.mjs` — the page shares the indexer's encoder rather
// than duplicating it. Wallets do not inject into file:// pages either,
// so serving is required, not a convenience.
//
//   node web/serve.mjs [port]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.argv[2] ?? 8080);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.css': 'text/css' };
// The page fetches ../out/index.json, so out/ has to be reachable — it is
// under ROOT already, but say so, because it is not obvious that a build
// artefact is part of what gets served.

createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  // Redirect rather than serve the page at '/': its script tags are
  // relative, so serving /web/index.html under '/' would resolve them to
  // /config.js and 404. The browser must actually be at /web/.
  if (p === '/' || p === '/web' || p === '/web/') {
    res.writeHead(302, { location: '/web/index.html' }).end();
    return;
  }
  // Keep traversal inside the project root.
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`http://127.0.0.1:${PORT}/`));

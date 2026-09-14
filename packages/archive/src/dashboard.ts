import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { bufferSource, probeFeatherSource } from './feather-probe.js';
import { nativeSchema, nativeSummary } from './native-feather.js';
import { downloadDocument, type FileRow, listFiles, withClient } from './telegram-client.js';
import { CHANNEL_ID, OBJECTS_DIR } from './telegram-env.js';

/**
 * Local-only dashboard for browsing and inspecting the Telegram archive.
 *
 * Binds to loopback (127.0.0.1) only, so it is never reachable off this machine
 * and is not part of the deployed app. Mutating requests are refused unless the
 * Host header is loopback. It reuses the same GramJS + pyarrow code as the CLI.
 *
 * Usage:  pnpm --filter @equitywise/archive tg:dashboard
 */

const HOST = '127.0.0.1';
const PORT = Number(process.env.ARCHIVE_DASHBOARD_PORT ?? '4599');

function isLoopbackHost(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').split(':')[0];
  return host === '127.0.0.1' || host === 'localhost';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Which of the three known daily series a filename belongs to. */
function seriesOf(fileName: string): string {
  if (fileName.includes('-bfo-')) return 'BSE F&O';
  if (fileName.includes('-index-nfo-')) return 'NSE index F&O';
  if (fileName.includes('tick_data')) return 'tick data (zip)';
  return 'other';
}

async function localBytes(fileName: string): Promise<number | null> {
  try {
    return (await stat(`${OBJECTS_DIR}/${fileName}`)).size;
  } catch {
    return null;
  }
}

async function handleFiles(res: ServerResponse, limit: number): Promise<void> {
  const rows = await withClient((client) => listFiles(client, limit));
  const withStatus = await Promise.all(
    rows.map(async (r: FileRow) => ({
      ...r,
      series: seriesOf(r.fileName),
      localBytes: await localBytes(r.fileName),
    })),
  );
  sendJson(res, 200, { channel: CHANNEL_ID, files: withStatus });
}

async function handleInspect(res: ServerResponse, messageId: number): Promise<void> {
  const { result, buffer } = await withClient((client) => downloadDocument(client, messageId));
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const probe = await probeFeatherSource(bufferSource(buffer));

  const isFeather = probe.format === 'feather_v2_or_arrow_ipc' && probe.envelopeConsistent;
  const schema = isFeather ? await nativeSchema(result.path) : null;
  const summary = isFeather ? await nativeSummary(result.path) : null;
  sendJson(res, 200, { file: result, sha256, probe, schema, summary });
}

async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/files') {
    const limit = Number(url.searchParams.get('limit') ?? '200') || 200;
    await handleFiles(res, limit);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/inspect') {
    if (!isLoopbackHost(req)) {
      sendJson(res, 403, { error: 'Refused: non-loopback host.' });
      return;
    }
    const body = (await readBody(req)) as { messageId?: number };
    const messageId = Number(body.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      sendJson(res, 400, { error: 'messageId required' });
      return;
    }
    await handleInspect(res, messageId);
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
}

const server = createServer((req, res) => {
  router(req, res).catch((error: unknown) => {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Archive dashboard: http://${HOST}:${PORT}  (channel ${CHANNEL_ID})`);
  console.log('Local-only. Press Ctrl+C to stop.');
});

// The single-page UI, served inline. Vanilla JS; theme-aware; responsive.
const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Archive dashboard</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f7f8; --panel: #fff; --border: #e3e3e6; --text: #1c1c1e;
    --muted: #6b6b70; --accent: #2563eb; --accent-fg: #fff; --ok: #15803d; --code: #f0f0f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17181a; --panel: #1f2023; --border: #2f3033; --text: #eaeaec;
      --muted: #9a9aa0; --accent: #3b82f6; --accent-fg: #fff; --ok: #4ade80; --code: #111214;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--panel); }
  h1 { font-size: 16px; margin: 0; }
  .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .wrap { display: grid; grid-template-columns: 1fr; gap: 16px; padding: 16px 20px; }
  @media (min-width: 900px) { .wrap { grid-template-columns: 1.3fr 1fr; } }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .card h2 { font-size: 13px; margin: 0; padding: 12px 14px; border-bottom: 1px solid var(--border);
    text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .controls { display: flex; gap: 8px; padding: 10px 14px; flex-wrap: wrap; align-items: center; }
  input, select, button { font: inherit; padding: 6px 10px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg); color: var(--text); }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .tablewrap { max-height: 65vh; overflow: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 540px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--panel); z-index: 1; }
  td.name { white-space: normal; overflow-wrap: anywhere; min-width: 210px; }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .have { color: var(--ok); font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  pre { margin: 0; padding: 14px; background: var(--code); overflow: auto; font-size: 12px;
    max-height: 65vh; border-radius: 0 0 10px 10px; }
  .muted { color: var(--muted); }
  .err { color: #dc2626; padding: 14px; }
</style>
</head>
<body>
<header>
  <h1>Telegram archive dashboard</h1>
  <div class="sub" id="chan">Local-only · loopback</div>
</header>
<div class="wrap">
  <div class="card">
    <h2>Files</h2>
    <div class="controls">
      <input id="filter" placeholder="Filter by name…" />
      <select id="series">
        <option value="">All series</option>
        <option>BSE F&amp;O</option>
        <option>NSE index F&amp;O</option>
        <option>tick data (zip)</option>
        <option>other</option>
      </select>
      <button class="primary" id="reload">Reload</button>
      <span class="muted" id="count"></span>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>File</th><th>Series</th><th class="num">MB</th><th>Date</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="5" class="muted" style="padding:14px">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <h2>Inspection</h2>
    <pre id="detail" class="muted">Select a file and click “Inspect” to download it locally and read its schema + summary.</pre>
  </div>
</div>
<script>
  const rowsEl = document.getElementById('rows');
  const detailEl = document.getElementById('detail');
  const filterEl = document.getElementById('filter');
  const seriesEl = document.getElementById('series');
  const countEl = document.getElementById('count');
  let all = [];

  const mb = (b) => (b / 1048576).toFixed(2);

  function render() {
    const f = filterEl.value.toLowerCase();
    const s = seriesEl.value;
    const shown = all.filter((r) =>
      r.fileName.toLowerCase().includes(f) && (!s || r.series === s));
    countEl.textContent = shown.length + ' / ' + all.length + ' files';
    if (!shown.length) { rowsEl.innerHTML = '<tr><td colspan="5" class="muted" style="padding:14px">No matches</td></tr>'; return; }
    rowsEl.innerHTML = shown.map((r) => {
      const have = r.localBytes != null ? '<span class="have">✓ local</span>' : '';
      return '<tr>' +
        '<td class="name">' + r.fileName + ' ' + have + '</td>' +
        '<td><span class="tag">' + r.series + '</span></td>' +
        '<td class="num">' + mb(r.bytes) + '</td>' +
        '<td>' + r.date.slice(0, 10) + '</td>' +
        '<td><button data-id="' + r.messageId + '">Inspect</button></td>' +
      '</tr>';
    }).join('');
  }

  async function loadFiles() {
    rowsEl.innerHTML = '<tr><td colspan="5" class="muted" style="padding:14px">Loading…</td></tr>';
    try {
      const res = await fetch('/api/files?limit=200');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      document.getElementById('chan').textContent = 'Channel ' + data.channel + ' · local-only · loopback';
      all = data.files;
      render();
    } catch (e) {
      rowsEl.innerHTML = '<tr><td colspan="5" class="err">' + e.message + '</td></tr>';
    }
  }

  async function inspect(id, btn) {
    btn.disabled = true; btn.textContent = 'Working…';
    detailEl.classList.remove('muted');
    detailEl.textContent = 'Downloading + reading msgId=' + id + '…';
    try {
      const res = await fetch('/api/inspect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      detailEl.textContent = JSON.stringify(data, null, 2);
      loadFiles();
    } catch (e) {
      detailEl.innerHTML = '<span class="err">' + e.message + '</span>';
    } finally {
      btn.disabled = false; btn.textContent = 'Inspect';
    }
  }

  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (btn) inspect(Number(btn.dataset.id), btn);
  });
  filterEl.addEventListener('input', render);
  seriesEl.addEventListener('change', render);
  document.getElementById('reload').addEventListener('click', loadFiles);
  loadFiles();
</script>
</body>
</html>`;

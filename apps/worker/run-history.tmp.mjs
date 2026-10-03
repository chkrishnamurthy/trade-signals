import { createDatabase } from '@equitywise/db';
const { backfillIpos, ingestIpoGmp } = await import(process.cwd() + '/dist/jobs/ingest-ipos.js');
const { extractIpoRhp } = await import(process.cwd() + '/dist/jobs/extract-ipo-rhp.js');
const handle = createDatabase({ url: process.env.DATABASE_URL });
const out = (level, job, m, f) => console.log(JSON.stringify({ ts: new Date().toISOString(), level, job, m, ...(f ?? {}) }));
const mk = (job) => ({
  child: (n) => mk(`${job}.${n}`),
  debug: () => {},
  info: (m, f) => out('info', job, m, f),
  warn: (m, f) => out('warn', job, m, f),
  error: (m, f) => out('error', job, m, f),
});
const ctx = { db: handle.db };
for (const [name, run] of [
  ['history', () => backfillIpos(ctx, mk('history'))],
  ['gmp', () => ingestIpoGmp(ctx, mk('gmp'))],
  ['rhp', () => extractIpoRhp(ctx, mk('rhp'), { maxDocuments: 200 })],
]) {
  const t = Date.now();
  try { out('info', name, 'START'); const r = await run(); out('info', name, 'DONE', { ...r, sec: Math.round((Date.now() - t) / 1000) }); }
  catch (e) { out('error', name, 'FAILED', { error: String(e?.message ?? e), sec: Math.round((Date.now() - t) / 1000) }); }
}
process.exit(0);

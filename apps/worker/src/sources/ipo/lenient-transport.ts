import { request } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import type { Transport, TransportResponse } from './http.js';

/**
 * A `node:https` transport with the lenient HTTP parser, for BSE.
 *
 * Some of BSE's servers send header lines that begin with a space. `fetch`
 * (undici) rejects the whole response for that ("Unexpected whitespace after
 * header value"), and the CDN caches the bad answer, so a retry cannot help.
 * Node's legacy parser in lenient mode reads the same response fine. Observed
 * on 2026-10-01 (announcements) and 2026-10-02 (IPO pages).
 *
 * Bodies are decompressed here (gzip / deflate / br), and the size cap and
 * abort signal are honoured. A redirect is RETURNED, not followed: the polite
 * client follows it hop by hop with its robots, site and budget checks.
 */
export function lenientHttpsTransport(maxBytes = 20 * 1024 * 1024): Transport {
  const once = (url: string, headers: Readonly<Record<string, string>>, signal: AbortSignal) =>
    new Promise<{
      status: number;
      headers: Map<string, string[]>;
      body: Buffer;
    }>((resolve, reject) => {
      const target = new URL(url);
      if (target.protocol !== 'https:') {
        reject(new Error(`${url}: only https is allowed`));
        return;
      }
      const req = request(
        target,
        {
          method: 'GET',
          headers: { 'Accept-Encoding': 'gzip, deflate, br', ...headers },
          insecureHTTPParser: true,
          signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy(new Error(`${url}: response exceeds the ${maxBytes}-byte cap`));
              return;
            }
            chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            const map = new Map<string, string[]>();
            for (const [name, value] of Object.entries(res.headers)) {
              if (value === undefined) continue;
              map.set(name.toLowerCase(), Array.isArray(value) ? value : [value]);
            }
            let body = Buffer.concat(chunks);
            const encoding = (map.get('content-encoding')?.[0] ?? '').toLowerCase().trim();
            try {
              if (encoding === 'gzip') body = gunzipSync(body);
              else if (encoding === 'deflate') body = inflateSync(body);
              else if (encoding === 'br') body = brotliDecompressSync(body);
            } catch (error) {
              reject(error);
              return;
            }
            resolve({ status: res.statusCode ?? 0, headers: map, body });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });

  return async ({ url, headers, signal }): Promise<TransportResponse> => {
    const res = await once(url, headers, signal);
    return { status: res.status, url, headers: res.headers, body: new Uint8Array(res.body) };
  };
}

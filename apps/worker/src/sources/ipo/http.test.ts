import { describe, expect, it } from 'vitest';
import {
  BudgetExceededError,
  CircuitOpenError,
  PoliteHttpClient,
  RedirectRefusedError,
  RobotsDisallowedError,
  RobotsUnavailableError,
  redirectRefusal,
  SourceHttpError,
  siteOf,
  type Transport,
  type TransportResponse,
} from './http.js';
import { isAllowed, parseRobots } from './robots.js';

describe('robots.txt', () => {
  // Shapes taken from the real files (2026-10-02).
  const chittorgarh = parseRobots(
    'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /ipo/ipo_discussions.asp\n\nUser-agent: *\nAllow: /\n',
  );
  const ipowatch = parseRobots(
    'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /wp-json/*\n',
  );

  it('applies the * group when ours is not named', () => {
    expect(isAllowed(chittorgarh, 'equitywise', '/ipo/ipo_discussions.asp')).toBe(false);
    expect(isAllowed(chittorgarh, 'equitywise', '/ipo/anything')).toBe(true);
    expect(isAllowed(chittorgarh, 'gptbot', '/')).toBe(false);
  });
  it('picks the longest rule, Allow winning a tie', () => {
    expect(isAllowed(ipowatch, 'equitywise', '/wp-admin/admin-ajax.php')).toBe(true);
    expect(isAllowed(ipowatch, 'equitywise', '/wp-admin/options.php')).toBe(false);
    expect(isAllowed(ipowatch, 'equitywise', '/wp-json/v2/posts')).toBe(false);
  });
  it('supports * and $ and an empty Disallow', () => {
    const rules = parseRobots('User-agent: equitywise\nDisallow: /*.pdf$\nDisallow:\n');
    expect(isAllowed(rules, 'EquityWise', '/files/a.pdf')).toBe(false);
    expect(isAllowed(rules, 'equitywise', '/files/a.pdf?x=1')).toBe(true);
    expect(isAllowed(parseRobots(''), 'equitywise', '/anything')).toBe(true);
  });
});

/** A scripted transport: each URL answers from a queue; records every request. */
function scripted(routes: Record<string, (Partial<TransportResponse> & { status: number })[]>) {
  const seen: { url: string; headers: Readonly<Record<string, string>> }[] = [];
  const transport: Transport = async ({ url, headers }) => {
    seen.push({ url, headers });
    const queue = routes[url];
    const next = queue?.shift() ?? { status: 404 };
    return {
      status: next.status,
      url,
      headers: next.headers ?? new Map(),
      body: next.body ?? new TextEncoder().encode('{}'),
    };
  };
  return { transport, seen };
}

function clock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

const base = {
  sourceId: 'test',
  userAgent: 'EquityWise/1.0',
  robotsAgent: 'equitywise',
  random: () => 0.5,
};

describe('PoliteHttpClient', () => {
  it('blocks a path robots.txt disallows, before requesting it', async () => {
    const { transport, seen } = scripted({
      'https://a.example/robots.txt': [
        { status: 200, body: new TextEncoder().encode('User-agent: *\nDisallow: /private') },
      ],
    });
    const c = clock();
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 1_000,
      maxRequestsPerRun: 10,
      transport,
      ...c,
    });
    await expect(client.get('https://a.example/private/x')).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
    expect(seen.map((s) => s.url)).toEqual(['https://a.example/robots.txt']);
  });

  it('treats an HTML robots answer as no rules, spaces requests, and sends the UA', async () => {
    const { transport, seen } = scripted({
      'https://a.example/robots.txt': [
        {
          status: 200,
          headers: new Map([['content-type', ['text/html']]]),
          body: new TextEncoder().encode('<html>'),
        },
      ],
      'https://a.example/one': [{ status: 200 }],
      'https://a.example/two': [{ status: 200 }],
    });
    const c = clock();
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 2_000,
      maxRequestsPerRun: 10,
      transport,
      ...c,
    });
    await client.get('https://a.example/one');
    await client.get('https://a.example/two');
    expect(seen.map((s) => s.url)).toEqual([
      'https://a.example/robots.txt',
      'https://a.example/one',
      'https://a.example/two',
    ]);
    expect(seen[1]?.headers['User-Agent']).toBe('EquityWise/1.0');
    // Two waits of the full interval between three back-to-back requests.
    expect(c.sleeps).toEqual([2_000, 2_000]);
    expect(client.requestsSpent).toBe(3);
  });

  it('retries a 503 with backoff, then succeeds', async () => {
    const { transport } = scripted({
      'https://a.example/x': [{ status: 503 }, { status: 200 }],
    });
    const c = clock();
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 1_000,
      maxRequestsPerRun: 10,
      respectRobots: false,
      transport,
      ...c,
    });
    const response = await client.get('https://a.example/x');
    expect(response.status).toBe(200);
    // Backoff = 0.5 × 2000 = 1000ms, then the min interval is already satisfied.
    expect(c.sleeps).toEqual([1_000]);
  });

  it('never retries a 404', async () => {
    const { transport, seen } = scripted({
      'https://a.example/x': [{ status: 404 }, { status: 200 }],
    });
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 1_000,
      maxRequestsPerRun: 10,
      respectRobots: false,
      transport,
      ...clock(),
    });
    await expect(client.get('https://a.example/x')).rejects.toBeInstanceOf(SourceHttpError);
    expect(seen).toHaveLength(1);
  });

  it('opens the circuit on a long Retry-After instead of waiting inside the job', async () => {
    const { transport, seen } = scripted({
      'https://a.example/x': [{ status: 429, headers: new Map([['retry-after', ['1358']]]) }],
    });
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 1_000,
      maxRequestsPerRun: 10,
      respectRobots: false,
      transport,
      ...clock(),
    });
    await expect(client.get('https://a.example/x')).rejects.toBeInstanceOf(CircuitOpenError);
    // The host is now cooling: the next call fails fast with no request.
    await expect(client.get('https://a.example/y')).rejects.toBeInstanceOf(CircuitOpenError);
    expect(seen).toHaveLength(1);
  });

  it('stops at the per-run budget', async () => {
    const { transport } = scripted({ 'https://a.example/x': [{ status: 200 }, { status: 200 }] });
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 1_000,
      maxRequestsPerRun: 1,
      respectRobots: false,
      transport,
      ...clock(),
    });
    await client.get('https://a.example/x');
    await expect(client.get('https://a.example/x')).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('keeps cookies a site sets and sends them back', async () => {
    const { transport, seen } = scripted({
      'https://a.example/page': [
        {
          status: 200,
          headers: new Map([
            ['set-cookie', ['nsit=abc; Path=/; HttpOnly', 'nseappid=xyz; Secure']],
          ]),
        },
      ],
      'https://a.example/api': [{ status: 200 }],
    });
    const client = new PoliteHttpClient({
      ...base,
      minIntervalMs: 1_000,
      maxRequestsPerRun: 10,
      respectRobots: false,
      transport,
      ...clock(),
    });
    await client.get('https://a.example/page');
    await client.get('https://a.example/api');
    expect(seen[1]?.headers.Cookie).toBe('nsit=abc; nseappid=xyz');
  });
});

describe('robots.txt availability (RFC 9309)', () => {
  const client = (transport: Transport) =>
    new PoliteHttpClient({
      ...base,
      minIntervalMs: 0,
      maxRequestsPerRun: 10,
      transport,
      ...clock(),
    });

  it('fetches nothing from a host whose robots.txt answers 5xx, for the whole run', async () => {
    const { transport, seen } = scripted({
      'https://a.example/robots.txt': [{ status: 503 }],
      'https://a.example/x': [{ status: 200 }],
    });
    const c = client(transport);
    await expect(c.get('https://a.example/x')).rejects.toBeInstanceOf(RobotsUnavailableError);
    await expect(c.get('https://a.example/y')).rejects.toBeInstanceOf(RobotsUnavailableError);
    expect(seen.map((s) => s.url)).toEqual(['https://a.example/robots.txt']);
  });

  it('treats a 429 or an unreachable robots.txt the same way', async () => {
    const limited = scripted({ 'https://a.example/robots.txt': [{ status: 429 }] });
    await expect(client(limited.transport).get('https://a.example/x')).rejects.toBeInstanceOf(
      RobotsUnavailableError,
    );
    const down: Transport = async ({ url }) => {
      if (url.endsWith('/robots.txt')) throw new Error('ECONNRESET');
      return { status: 200, url, headers: new Map(), body: new Uint8Array() };
    };
    await expect(client(down).get('https://a.example/x')).rejects.toBeInstanceOf(
      RobotsUnavailableError,
    );
  });

  it('treats a 4xx robots.txt as no rules', async () => {
    const { transport, seen } = scripted({
      'https://a.example/robots.txt': [{ status: 404 }],
      'https://a.example/x': [{ status: 200 }],
    });
    expect((await client(transport).get('https://a.example/x')).status).toBe(200);
    expect(seen).toHaveLength(2);
  });
});

describe('redirects', () => {
  const to = (location: string) => ({ status: 302, headers: new Map([['location', [location]]]) });
  const client = (transport: Transport) =>
    new PoliteHttpClient({
      ...base,
      minIntervalMs: 0,
      maxRequestsPerRun: 20,
      transport,
      ...clock(),
    });

  it('names the site a host belongs to, Indian second-level domains included', () => {
    expect(siteOf('nsearchives.nseindia.com')).toBe('nseindia.com');
    expect(siteOf('www.sebi.gov.in')).toBe('sebi.gov.in');
    expect(siteOf('api.bseindia.com')).toBe('bseindia.com');
    expect(siteOf('example.in')).toBe('example.in');
  });

  it('refuses a downgrade to http and a hop off the site', () => {
    const from = new URL('https://nsearchives.nseindia.com/a.zip');
    expect(redirectRefusal(from, new URL('https://www.nseindia.com/b'))).toBeNull();
    expect(redirectRefusal(from, new URL('http://www.nseindia.com/b'))).toMatch(/https/);
    expect(redirectRefusal(from, new URL('https://cdn.example.com/b'))).toMatch(/site/);
  });

  it("follows a same-site redirect, checking the new host's robots.txt", async () => {
    const { transport, seen } = scripted({
      'https://a.example/robots.txt': [{ status: 404 }],
      'https://a.example/doc': [to('https://files.a.example/doc.pdf')],
      'https://files.a.example/robots.txt': [{ status: 404 }],
      'https://files.a.example/doc.pdf': [{ status: 200 }],
    });
    const response = await client(transport).get('https://a.example/doc');
    expect(response.status).toBe(200);
    expect(response.url).toBe('https://files.a.example/doc.pdf');
    expect(seen.map((s) => s.url)).toEqual([
      'https://a.example/robots.txt',
      'https://a.example/doc',
      'https://files.a.example/robots.txt',
      'https://files.a.example/doc.pdf',
    ]);
  });

  it('never fetches a redirect target on another site', async () => {
    const { transport, seen } = scripted({
      'https://a.example/doc': [to('https://evil.test/doc.pdf')],
    });
    await expect(client(transport).get('https://a.example/doc')).rejects.toBeInstanceOf(
      RedirectRefusedError,
    );
    expect(seen.some((s) => s.url.startsWith('https://evil.test'))).toBe(false);
  });

  it('obeys robots.txt on the redirect target', async () => {
    const { transport, seen } = scripted({
      'https://a.example/doc': [to('https://files.a.example/private/doc.pdf')],
      'https://files.a.example/robots.txt': [
        { status: 200, body: new TextEncoder().encode('User-agent: *\nDisallow: /private') },
      ],
    });
    await expect(client(transport).get('https://a.example/doc')).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
    expect(seen.map((s) => s.url)).not.toContain('https://files.a.example/private/doc.pdf');
  });

  it('gives up after five hops', async () => {
    const routes: Record<string, { status: number; headers?: Map<string, string[]> }[]> = {};
    for (let i = 0; i < 7; i += 1)
      routes[`https://a.example/${i}`] = [to(`https://a.example/${i + 1}`)];
    const { transport } = scripted(routes);
    await expect(client(transport).get('https://a.example/0')).rejects.toThrow(/redirects/);
  });
});

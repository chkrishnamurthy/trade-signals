import { describe, expect, it } from 'vitest';
import { isPooledUrl, readDatabaseEnv } from './env.js';

const POOLED =
  'postgresql://u:p@ep-cool-dawn-123-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require';
const DIRECT = 'postgresql://u:p@ep-cool-dawn-123.ap-southeast-1.aws.neon.tech/db?sslmode=require';

describe('readDatabaseEnv', () => {
  it('accepts a well-formed pair', () => {
    expect(readDatabaseEnv({ DATABASE_URL: POOLED, DATABASE_URL_DIRECT: DIRECT })).toEqual({
      DATABASE_URL: POOLED,
      DATABASE_URL_DIRECT: DIRECT,
    });
  });

  it('accepts the postgres:// scheme as well as postgresql://', () => {
    const url = 'postgres://u:p@host.neon.tech/db?sslmode=require';
    expect(readDatabaseEnv({ DATABASE_URL: url, DATABASE_URL_DIRECT: url }).DATABASE_URL).toBe(url);
  });

  it('names every missing variable at once', () => {
    expect(() => readDatabaseEnv({})).toThrow(/DATABASE_URL[\s\S]*DATABASE_URL_DIRECT/);
  });

  it('points at .env.example in the message', () => {
    expect(() => readDatabaseEnv({})).toThrow(/\.env\.example/);
  });

  it('rejects a non-postgres URL', () => {
    expect(() =>
      readDatabaseEnv({ DATABASE_URL: 'mysql://u:p@host/db', DATABASE_URL_DIRECT: DIRECT }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects something that is not a URL at all', () => {
    expect(() =>
      readDatabaseEnv({ DATABASE_URL: 'localhost:5432', DATABASE_URL_DIRECT: DIRECT }),
    ).toThrow(/DATABASE_URL/);
  });
});

describe('isPooledUrl', () => {
  it('detects Neon pooled endpoints by the -pooler host suffix', () => {
    expect(isPooledUrl(POOLED)).toBe(true);
    expect(isPooledUrl(DIRECT)).toBe(false);
  });

  it('looks at the host, not the database name or query string', () => {
    expect(isPooledUrl('postgresql://u:p@ep-x.neon.tech/my-pooler-db')).toBe(false);
  });
});

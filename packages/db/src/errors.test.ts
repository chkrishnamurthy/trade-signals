import { describe, expect, it } from 'vitest';
import { describeFailure, isUniqueViolation, violatedConstraint } from './errors.js';

/** The shape `pg` throws for a duplicate key. */
const pgDuplicate = Object.assign(
  new Error('duplicate key value violates unique constraint "watchlists_owner_name_idx"'),
  {
    code: '23505',
    constraint: 'watchlists_owner_name_idx',
    detail: 'Key (owner_id, name)=(7, Secret list) already exists.',
  },
);

/** The shape Drizzle rethrows: SQL and params in the message, the pg error as `cause`. */
function wrapped(cause: unknown): Error {
  return Object.assign(
    new Error('Failed query: insert into "holding_entries" …\nparams: 7,RELIANCE,120,245050'),
    { cause },
  );
}

describe('isUniqueViolation', () => {
  it('recognises the driver error itself', () => {
    expect(isUniqueViolation(pgDuplicate)).toBe(true);
  });

  it('recognises the error Drizzle wraps it in', () => {
    expect(isUniqueViolation(wrapped(pgDuplicate))).toBe(true);
  });

  it('is false for other failures and non-errors', () => {
    expect(isUniqueViolation(wrapped(Object.assign(new Error('fk'), { code: '23503' })))).toBe(
      false,
    );
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});

describe('violatedConstraint', () => {
  it('names the constraint through the wrapper', () => {
    expect(violatedConstraint(wrapped(pgDuplicate))).toBe('watchlists_owner_name_idx');
  });

  it('is null when there is none', () => {
    expect(violatedConstraint(new Error('boom'))).toBeNull();
  });
});

describe('describeFailure', () => {
  it('never includes the query parameters or the offending values', () => {
    const text = describeFailure(wrapped(pgDuplicate));
    expect(text).toBe(
      'postgres 23505 (watchlists_owner_name_idx): duplicate key value violates unique constraint "watchlists_owner_name_idx"',
    );
    expect(text).not.toContain('RELIANCE');
    expect(text).not.toContain('245050');
    expect(text).not.toContain('Secret list');
  });

  it('describes a wrapped failure with no SQLSTATE by its cause only', () => {
    const text = describeFailure(wrapped(new Error('Connection terminated unexpectedly')));
    expect(text).toBe('query failed: Connection terminated unexpectedly');
  });

  it('describes an ordinary error by name and message', () => {
    expect(describeFailure(new TypeError('x is not a function'))).toBe(
      'TypeError: x is not a function',
    );
    expect(describeFailure('plain')).toBe('plain');
  });
});

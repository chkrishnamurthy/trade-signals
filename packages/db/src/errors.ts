/**
 * Reading a failed query.
 *
 * Drizzle wraps every driver error in its own `DrizzleQueryError`, whose message
 * is the SQL text and its parameters and whose `cause` is the Postgres error.
 * So the SQLSTATE (`23505`) is on `error.cause.code`, not `error.code` — a check
 * of the top-level error alone never matches. These helpers look in both places,
 * and are the only supported way to recognise a database failure.
 */

const UNIQUE_VIOLATION = '23505';

interface PostgresErrorFields {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly message?: unknown;
}

function fieldsOf(value: unknown): PostgresErrorFields | null {
  return typeof value === 'object' && value !== null ? (value as PostgresErrorFields) : null;
}

/** The Postgres error behind a failure: the error itself, or the one Drizzle wrapped. */
function postgresError(error: unknown): PostgresErrorFields | null {
  const top = fieldsOf(error);
  if (top === null) return null;
  if (typeof top.code === 'string') return top;
  const cause = fieldsOf((error as { cause?: unknown }).cause);
  return cause !== null && typeof cause.code === 'string' ? cause : null;
}

/** True when the failure is a unique-index violation — a row that already exists. */
export function isUniqueViolation(error: unknown): boolean {
  return postgresError(error)?.code === UNIQUE_VIOLATION;
}

/** The name of the constraint a failed write violated, when Postgres named one. */
export function violatedConstraint(error: unknown): string | null {
  const constraint = postgresError(error)?.constraint;
  return typeof constraint === 'string' && constraint !== '' ? constraint : null;
}

/**
 * A description of a failure that is safe to write to a log.
 *
 * Never the Drizzle message: it carries the query parameters, which for a
 * portfolio write are the user's holdings (CLAUDE.md hard rule 7). For a database
 * failure this is the SQLSTATE, the constraint and Postgres's one-line message;
 * the `detail` field, which quotes the offending values, is left out.
 */
export function describeFailure(error: unknown): string {
  const pg = postgresError(error);
  if (pg !== null) {
    const constraint = violatedConstraint(error);
    const message = typeof pg.message === 'string' ? pg.message : 'database error';
    return `postgres ${String(pg.code)}${constraint === null ? '' : ` (${constraint})`}: ${message}`;
  }
  const hasCause = fieldsOf(error) !== null && 'cause' in (error as object);
  if (hasCause) {
    // A wrapped query failure with no SQLSTATE (a dropped connection, say).
    const cause = fieldsOf((error as { cause?: unknown }).cause);
    return `query failed: ${typeof cause?.message === 'string' ? cause.message : 'unknown cause'}`;
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

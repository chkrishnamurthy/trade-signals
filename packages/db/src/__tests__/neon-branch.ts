/**
 * Ephemeral Neon test branches.
 *
 * A schema test needs a database it is allowed to migrate from empty and then
 * throw away. Neon branches are the cheap way to get one: copy-on-write off the
 * parent, seconds to create, free to delete.
 *
 * Test-only. Not exported from the package index and excluded from the build.
 */

const NEON_API = 'https://console.neon.tech/api/v2';

export interface NeonCredentials {
  readonly apiKey: string;
  readonly projectId: string;
}

export interface EphemeralBranch {
  readonly id: string;
  readonly name: string;
  /** Direct (non-pooled) connection string — the one migrations need. */
  readonly connectionUri: string;
  /** Deletes the branch. Safe to call more than once. */
  destroy(): Promise<void>;
}

/**
 * Reads the credentials the branch helper needs.
 *
 * Returns `undefined` rather than throwing when they are absent, so a suite can
 * skip cleanly on a machine with no Neon access instead of failing.
 */
export function readNeonCredentials(
  source: NodeJS.ProcessEnv = process.env,
): NeonCredentials | undefined {
  const apiKey = source.NEON_API_KEY;
  const projectId = source.NEON_PROJECT_ID;
  if (apiKey === undefined || apiKey === '' || projectId === undefined || projectId === '') {
    return undefined;
  }
  return { apiKey, projectId };
}

async function neonRequest<T>(
  credentials: NeonCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${NEON_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Neon API ${init.method ?? 'GET'} ${path} -> ${response.status}: ${body}`);
  }

  // DELETE returns a body, but callers do not need it; keep the parse uniform.
  return (await response.json()) as T;
}

interface CreateBranchResponse {
  branch: { id: string; name: string };
  connection_uris?: { connection_uri: string }[];
}

interface OperationsResponse {
  operations: { id: string; status: string; action: string }[];
}

/** Blocks until no operation on the project is still running. */
async function waitForOperations(credentials: NeonCredentials, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { operations } = await neonRequest<OperationsResponse>(
      credentials,
      `/projects/${credentials.projectId}/operations?limit=20`,
    );
    const pending = operations.filter(
      (op) => op.status === 'running' || op.status === 'scheduling',
    );
    if (pending.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Neon operations did not settle within ${timeoutMs}ms`);
}

export interface CreateTestBranchOptions {
  /** Branch to fork from. Defaults to the project's default branch. */
  readonly parentId?: string;
  /** Prefix for the generated branch name. */
  readonly prefix?: string;
  /** How long to wait for the branch endpoint to come up. Default 60s. */
  readonly timeoutMs?: number;
}

/**
 * Creates a branch with its own read-write endpoint and returns how to reach it.
 *
 * The name carries a timestamp and a random suffix so parallel runs — and a run
 * that crashed before cleanup — never collide.
 */
export async function createTestBranch(
  credentials: NeonCredentials,
  options: CreateTestBranchOptions = {},
): Promise<EphemeralBranch> {
  const { prefix = 'test', timeoutMs = 60_000 } = options;
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `${prefix}-${suffix}`;

  const created = await neonRequest<CreateBranchResponse>(
    credentials,
    `/projects/${credentials.projectId}/branches`,
    {
      method: 'POST',
      body: JSON.stringify({
        branch: {
          name,
          ...(options.parentId === undefined ? {} : { parent_id: options.parentId }),
        },
        endpoints: [{ type: 'read_write' }],
      }),
    },
  );

  const branchId = created.branch.id;
  let destroyed = false;
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    await waitForOperations(credentials, timeoutMs).catch(() => undefined);
    await neonRequest(credentials, `/projects/${credentials.projectId}/branches/${branchId}`, {
      method: 'DELETE',
    });
  };

  try {
    const uri = created.connection_uris?.[0]?.connection_uri;
    if (uri === undefined) {
      throw new Error(`Neon returned no connection URI for branch ${name}`);
    }
    await waitForOperations(credentials, timeoutMs);

    // node-postgres already treats sslmode=require as verify-full and warns
    // that it will stop doing so; say what we mean.
    const connectionUri = new URL(uri);
    connectionUri.searchParams.set('sslmode', 'verify-full');

    return { id: branchId, name, connectionUri: connectionUri.toString(), destroy };
  } catch (error) {
    await destroy().catch(() => undefined);
    throw error;
  }
}

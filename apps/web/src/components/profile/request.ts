/**
 * Small JSON helper for the profile/account mutations. Normalises the API's
 * `{ error, remedy }` shape into a single message so each form can just show it.
 */
export async function sendJson<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = typeof data.error === 'string' ? data.error : 'Something went wrong.';
      const remedy = typeof data.remedy === 'string' ? ` ${data.remedy}` : '';
      return { ok: false, error: `${error}${remedy}` };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
}

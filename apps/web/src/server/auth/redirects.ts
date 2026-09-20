const FALLBACK = '/watchlists';

/** Accept a local path only. URL parsing also normalises encoded path segments. */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return FALLBACK;
  if (!value.startsWith('/') || value.startsWith('//') || hasForbiddenCharacter(value)) {
    return FALLBACK;
  }
  try {
    const parsed = new URL(value, 'https://equitywise.invalid');
    if (parsed.origin !== 'https://equitywise.invalid') return FALLBACK;
    if (parsed.username || parsed.password) return FALLBACK;
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath.startsWith('//') || hasForbiddenCharacter(decodedPath)) return FALLBACK;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK;
  }
}

function hasForbiddenCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === '\\' || code < 32 || code === 127) return true;
  }
  return false;
}

import type { PortfolioEntryDto } from '@/lib/portfolio-types';

export type Result = { ok: true } | { ok: false; message: string };

export async function request(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Result & { data?: unknown }> {
  try {
    const init: RequestInit =
      body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetch(url, init);
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: payload };
    const err = payload as { error?: string; remedy?: string } | null;
    return {
      ok: false,
      message: [err?.error, err?.remedy].filter(Boolean).join(' ') || 'Something went wrong.',
    };
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }
}

export const KIND_LABEL: Record<PortfolioEntryDto['kind'], string> = {
  opening: 'Shares I own',
  add: 'Added shares',
  remove: 'Removed shares',
};

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const pctText = (ratio: number, decimals = 1) =>
  `${(Math.abs(ratio) * 100).toFixed(decimals)}%`;

import { readSignal } from '@/server/trade-signals';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return readSignal((await context.params).id);
}

import { readIntradayDay } from '@/server/intraday';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ date: string }> }) {
  const { date } = await context.params;
  return readIntradayDay(date);
}

import { readPaperTrades } from '@/server/paper';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = readPaperTrades;

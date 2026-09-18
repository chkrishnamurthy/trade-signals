import { readPaperStrategies, writePaperStrategy } from '@/server/paper';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = readPaperStrategies;
export const PUT = writePaperStrategy;

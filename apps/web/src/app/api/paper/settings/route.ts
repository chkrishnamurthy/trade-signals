import { readPaperSettings, writePaperSettings } from '@/server/paper';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = readPaperSettings;
export const PUT = writePaperSettings;

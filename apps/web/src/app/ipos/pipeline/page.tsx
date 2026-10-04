import type { Metadata } from 'next';
import { IpoPipelineView } from '@/components/ipos/pipeline/ipo-pipeline-view';
import { readOrSignIn } from '@/components/ipos/section-route';
import { ipoDashboardQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoPipelinePage } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'IPO pipeline — EquityWise',
  description:
    'Draft prospectuses filed with SEBI and the offer documents of Indian IPOs still ahead.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IpoPipelineRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoDashboardQuerySchema.safeParse(params);
  const scope = parsed.success ? parsed.data.board : 'all';
  const data = await readOrSignIn(`/ipos/pipeline${scope === 'all' ? '' : `?board=${scope}`}`, () =>
    getIpoPipelinePage(scope),
  );
  return <IpoPipelineView data={data} />;
}

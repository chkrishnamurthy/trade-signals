import { ImageResponse } from 'next/og';

/**
 * The share card for every page that has no card of its own: what a link to
 * EquityWise looks like in WhatsApp, LinkedIn or X. Drawn at build time with
 * Next's bundled font — no network, no screenshot of real market data.
 */
export const alt = 'EquityWise — plain-English research on NSE stocks. Not investment advice.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const GREEN = '#007a4d';
const INK = '#0f172a';
const MUTED = '#475569';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#ffffff',
        borderTop: `16px solid ${GREEN}`,
        color: INK,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: GREEN,
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          E
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>EquityWise</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          Know why a stock deserves your attention.
        </div>
        <div style={{ fontSize: 32, color: MUTED, lineHeight: 1.3 }}>
          Plain-English research on NSE stocks: watchlists, a screener and a brief after every
          close.
        </div>
      </div>
      <div style={{ fontSize: 26, color: MUTED }}>
        Free to use · Not a broker · Not investment advice
      </div>
    </div>,
    size,
  );
}

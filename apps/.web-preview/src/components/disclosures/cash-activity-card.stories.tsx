import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { FiiDiiDayDto } from '@/lib/disclosure-types';
import { CashActivityCard } from './cash-activity-card';

/**
 * FII / DII cash activity — the cash-flow card in the `/flows` market tape.
 * Fixture data is a seeded pseudo-random walk, so every render is identical;
 * values are integer paise like the real DTO.
 */
const meta = {
  title: 'Domain/CashActivityCard',
  component: CashActivityCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CashActivityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hundredths of a crore → paise (1 Cr = 1e9 paise). */
const CR_HUNDREDTHS = 10_000_000;

/** Weekday sessions ending on `last`, newest first — the shape the server sends. */
function fixture(sessions: number, last = '2026-10-01', seed = 11): FiiDiiDayDto[] {
  let state = seed;
  const random = (): number => {
    // Park–Miller: small enough multiplier that the product stays an exact double.
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };
  const side = (net: number) => {
    const buy = 11_000_00 + Math.round(random() * 7_000_00);
    return {
      buy: buy * CR_HUNDREDTHS,
      sell: (buy - net) * CR_HUNDREDTHS,
      net: net * CR_HUNDREDTHS,
    };
  };
  const out: FiiDiiDayDto[] = [];
  const date = new Date(`${last}T12:00:00Z`);
  let drift = -1_800_00;
  while (out.length < sessions) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      drift = Math.round(drift * 0.85 + (random() - 0.55) * 1_400_00);
      const fii = Math.round(drift + (random() - 0.5) * 3_600_00);
      const dii = Math.round(-fii * 0.8 + (random() - 0.35) * 1_800_00);
      out.push({ tradingDate: date.toISOString().slice(0, 10), fii: side(fii), dii: side(dii) });
    }
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return out;
}

export const Default: Story = { args: { history: fixture(120) } };

/** Early days of ingestion: only a few sessions on file. */
export const FewSessions: Story = { args: { history: fixture(5) } };

/** One session with no DII row — drawn as absent, never as a flat zero. */
export const MissingSession: Story = {
  args: { history: fixture(30).map((day, i) => (i === 2 ? { ...day, dii: null } : day)) },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TONE_GLYPH, type Tone, toneFill, toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { Ground } from './_swatch';

/**
 * Directional tone — the single source of truth for "is this green or red?".
 * Colour is never the only carrier: every tone ships a ▲/▼/→ glyph, so the
 * meaning survives for anyone who cannot separate red from green.
 */
const meta = {
  title: 'Foundations/Tone',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TONES: Tone[] = ['bullish', 'bearish', 'neutral'];

export const Directions: Story = {
  render: () => (
    <Ground>
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Text + glyph (toneText)</h3>
          <div className="flex flex-wrap gap-6">
            {TONES.map((tone) => (
              <span key={tone} className={cn('text-lg font-medium', toneText({ tone }))}>
                {TONE_GLYPH[tone]} {tone}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Fill (toneFill)</h3>
          <div className="flex flex-wrap gap-6">
            {TONES.map((tone) => (
              <div key={tone} className="flex items-center gap-2">
                <span className={cn('h-4 w-10 rounded-sm', toneFill({ tone }))} />
                <span className="text-xs text-muted-foreground">{tone}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            toneOf() — zero is neutral, never "slightly up"
          </h3>
          <div className="flex flex-col gap-1 font-mono text-xs">
            {[+1.8, 0, -2.4].map((v) => {
              const tone = toneOf(v);
              return (
                <span key={v} className={toneText({ tone })}>
                  {TONE_GLYPH[tone]} toneOf({v.toFixed(1)}) → {tone}
                </span>
              );
            })}
          </div>
        </section>
      </div>
    </Ground>
  ),
};

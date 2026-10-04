import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Text } from '@/components/ui/typography';
import { Ground } from './_swatch';

/**
 * The type scale — thirteen named roles owned entirely by `typography.tsx`.
 * Nothing outside that file picks a font size.
 */
const meta = {
  title: 'Foundations/Typography',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ROLES = [
  'display',
  'metric',
  'page-title',
  'section-title',
  'card-title',
  'body',
  'secondary',
  'value',
  'indicator',
  'label',
  'caption',
  'overline',
  'micro',
  'nano',
] as const;

const SAMPLE: Record<(typeof ROLES)[number], string> = {
  display: '₹2,985.50',
  metric: '18,642.55',
  'page-title': 'Watchlists',
  'section-title': 'Momentum leaders',
  'card-title': 'RELIANCE',
  body: 'The quick brown fox jumps over the lazy dog.',
  secondary: 'Supporting copy in a quieter tone.',
  value: '1,245.50',
  indicator: 'RSI 62.4  ATR 18.2  EMA 1,240',
  label: 'Last price',
  caption: 'as of 15:30 IST',
  overline: 'Market breadth',
  micro: 'Dense table cell / metadata',
  nano: 'Overline · axis label · chip',
};

export const Scale: Story = {
  render: () => (
    <Ground>
      <div className="flex max-w-3xl flex-col gap-5">
        {ROLES.map((role) => (
          <div key={role} className="flex items-baseline gap-4 border-b border-border pb-4">
            <code className="w-28 shrink-0 text-2xs text-subtle-foreground">{role}</code>
            <Text variant={role}>{SAMPLE[role]}</Text>
          </div>
        ))}
      </div>
    </Ground>
  ),
};

export const TabularFigures: Story = {
  name: 'Figures align (metric / value / indicator)',
  render: () => (
    <Ground>
      <div className="flex max-w-xs flex-col gap-1">
        {['1,245.50', '98.05', '12,340.00', '7.25', '1,00,204.65'].map((n) => (
          <Text key={n} variant="value" className="tabular-nums">
            {n}
          </Text>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        The <code>figure</code> utility gives fixed-width digits, so a column of prices lines up
        without a monospace face.
      </p>
    </Ground>
  ),
};

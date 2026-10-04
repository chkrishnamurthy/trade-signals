import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Ground } from './_swatch';

/**
 * The non-colour scales — radius, shadow, and the micro type sizes. Each is a
 * short, fixed set: "four steps, no more" for radius; three for shadow.
 */
const meta = {
  title: 'Foundations/Scales',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Radius: Story = {
  render: () => (
    <Ground>
      <div className="flex flex-wrap gap-6">
        {(['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl'] as const).map((r) => (
          <div key={r} className="flex flex-col items-center gap-2">
            <div className={`h-20 w-20 border border-border-strong bg-surface ${r}`} />
            <code className="text-2xs text-subtle-foreground">{r}</code>
          </div>
        ))}
      </div>
    </Ground>
  ),
};

export const Shadow: Story = {
  render: () => (
    <Ground>
      <div className="flex flex-wrap gap-10">
        {(['shadow-subtle', 'shadow-elevated', 'shadow-overlay'] as const).map((s) => (
          <div key={s} className="flex flex-col items-center gap-3">
            <div className={`h-24 w-40 rounded-lg bg-surface ${s}`} />
            <code className="text-2xs text-subtle-foreground">{s}</code>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Depth comes from borders first; shadow is used sparingly.
      </p>
    </Ground>
  ),
};

export const MicroSizes: Story = {
  name: 'Micro type sizes (2xs / 3xs)',
  render: () => (
    <Ground>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-4">
          <code className="w-24 text-2xs text-subtle-foreground">text-xs</code>
          <span className="text-xs">0.75rem — the default floor</span>
        </div>
        <div className="flex items-baseline gap-4">
          <code className="w-24 text-2xs text-subtle-foreground">text-2xs</code>
          <span className="text-2xs">0.6875rem — dense tables, metadata</span>
        </div>
        <div className="flex items-baseline gap-4">
          <code className="w-24 text-2xs text-subtle-foreground">text-3xs</code>
          <span className="text-3xs">0.625rem — overlines, chart-axis labels</span>
        </div>
      </div>
      <p className="mt-6 max-w-lg text-xs text-muted-foreground">
        These replace the hard-coded <code>text-[0.6875rem]</code> / <code>text-[0.625rem]</code>{' '}
        values that had escaped the scale across ~15 components.
      </p>
    </Ground>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { ToastProvider, type ToastVariant, useToast } from './toast';

/**
 * In-house toast for fire-and-forget mutations (reorder, remove, add-to-list) so
 * a failure reports instead of failing in silence. Tone mirrors `Alert`:
 * `warning`/`destructive` carry real meaning about whether an action succeeded.
 */
const meta = {
  title: 'Primitives/Toast',
  component: ToastProvider,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

const COPY: Record<ToastVariant, { title: string; description: string }> = {
  default: { title: 'Added to Momentum', description: 'RELIANCE is now on the list.' },
  success: { title: 'Order of columns saved', description: 'Your layout will persist.' },
  warning: { title: 'Showing cached data', description: 'The market-data token expired.' },
  destructive: { title: "Couldn't remove stock", description: 'Network error — try again.' },
};

function Raiser() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      {(['default', 'success', 'warning', 'destructive'] as const).map((variant) => (
        <Button
          key={variant}
          variant={variant === 'destructive' ? 'destructive' : 'outline'}
          onClick={() => toast({ ...COPY[variant], variant })}
        >
          {variant}
        </Button>
      ))}
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <Raiser />
    </ToastProvider>
  ),
};

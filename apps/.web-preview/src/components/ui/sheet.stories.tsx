import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta = {
  title: 'Primitives/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ side }: { side: 'right' | 'left' | 'top' | 'bottom' }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open {side}</Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <div>
            <SheetTitle>RELIANCE</SheetTitle>
            <SheetDescription>Reliance Industries · NSE</SheetDescription>
          </div>
        </SheetHeader>
        <SheetBody>
          <p className="text-sm text-muted-foreground">
            Detail content — indicators, returns and the "why this signal" breakdown.
          </p>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Edge-anchored drawer on Radix Dialog — the stock detail drawer uses `right`. */
export const Right: Story = { render: () => <Demo side="right" /> };
export const Left: Story = { render: () => <Demo side="left" /> };
export const Bottom: Story = { render: () => <Demo side="bottom" /> };

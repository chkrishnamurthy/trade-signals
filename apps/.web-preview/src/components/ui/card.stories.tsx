import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from './card';

const meta = {
  title: 'Primitives/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Compositional, not prop-driven: header / toolbar / content / footer are slots. */
export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardHeading>
          <CardTitle>Momentum leaders</CardTitle>
          <CardDescription>Top gainers by 20-day trend</CardDescription>
        </CardHeading>
        <CardToolbar>
          <Button size="sm" variant="ghost">
            View all
          </Button>
        </CardToolbar>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Body content sits here.</p>
      </CardContent>
      <CardFooter>
        <span>8 stocks</span>
        <span>as of 15:30 IST</span>
      </CardFooter>
    </Card>
  ),
};

export const BareBody: Story = {
  render: () => (
    <Card className="w-80">
      <CardContent>
        <p className="text-sm">A card with only a body — no header or footer.</p>
      </CardContent>
    </Card>
  ),
};

/** `flush` drops the body padding for a list or table that draws its own edges. */
export const FlushContent: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardHeading>
          <CardTitle>Watchlist</CardTitle>
        </CardHeading>
      </CardHeader>
      <CardContent flush>
        <ul className="divide-y divide-border text-sm">
          <li className="px-4 py-2">RELIANCE</li>
          <li className="px-4 py-2">TCS</li>
          <li className="px-4 py-2">HDFCBANK</li>
        </ul>
      </CardContent>
    </Card>
  ),
};

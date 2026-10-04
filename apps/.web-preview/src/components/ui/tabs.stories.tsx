import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'Primitives/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="momentum" className="w-80">
      <TabsList>
        <TabsTrigger value="momentum">Momentum</TabsTrigger>
        <TabsTrigger value="breakouts">Breakouts</TabsTrigger>
        <TabsTrigger value="volume">Volume</TabsTrigger>
      </TabsList>
      <TabsContent value="momentum">
        <p className="text-sm text-muted-foreground">Stocks trending up over 20 days.</p>
      </TabsContent>
      <TabsContent value="breakouts">
        <p className="text-sm text-muted-foreground">Names clearing a 52-week high.</p>
      </TabsContent>
      <TabsContent value="volume">
        <p className="text-sm text-muted-foreground">Unusual volume vs. the 30-day average.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithDisabled: Story = {
  render: () => (
    <Tabs defaultValue="a" className="w-80">
      <TabsList>
        <TabsTrigger value="a">Enabled</TabsTrigger>
        <TabsTrigger value="b" disabled>
          Disabled
        </TabsTrigger>
      </TabsList>
      <TabsContent value="a">
        <p className="text-sm text-muted-foreground">The second tab is disabled.</p>
      </TabsContent>
    </Tabs>
  ),
};

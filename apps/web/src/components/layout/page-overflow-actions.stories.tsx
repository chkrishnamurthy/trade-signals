import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DownloadIcon, FileUpIcon, ListIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageActions, PageHeader, PageHeading, PageTitle } from './page';
import { PageOverflowActions } from './page-overflow-actions';

/**
 * A page header's secondary actions: buttons from `sm`, one "…" menu on
 * phones. Shown inside a real `PageHeader` with its one primary button.
 */
const meta = {
  title: 'Layout/PageOverflowActions',
  component: PageOverflowActions,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    label: 'More portfolio actions',
    actions: [
      { id: 'upload', label: 'Upload a file', icon: FileUpIcon, onSelect: () => {} },
      { id: 'export', label: 'Export CSV', icon: DownloadIcon, onSelect: () => {} },
      {
        id: 'entries',
        label: 'Your entries',
        icon: ListIcon,
        variant: 'ghost',
        onSelect: () => {},
      },
    ],
  },
  render: (args) => (
    <PageHeader>
      <PageHeading>
        <PageTitle>Portfolio</PageTitle>
      </PageHeading>
      <PageActions>
        <Button size="sm">
          <PlusIcon /> Add shares
        </Button>
        <PageOverflowActions {...args} />
      </PageActions>
    </PageHeader>
  ),
} satisfies Meta<typeof PageOverflowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** One row: the title, the primary button and the menu. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

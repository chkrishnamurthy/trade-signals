import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  AdaptivePopover,
  PanelBody,
  PanelGroupLabel,
  PanelHeader,
  PanelItem,
  PanelMessage,
  PanelSeparator,
} from './adaptive-popover';
import { Button } from './button';

/**
 * One panel, two shapes: a popover under its trigger from `sm`, a bottom sheet
 * on phones. Switch the Viewport toolbar between Mobile and Desktop and open it.
 *
 * The inside is built from the `Panel*` parts, which look the same in both
 * forms: header with an action, a scrolling body, group labels, rows (36px with
 * a mouse, 44px on touch), separators and an empty/error message.
 */
const meta = {
  title: 'Primitives/AdaptivePopover',
  component: AdaptivePopover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    title: 'Filters',
    trigger: <Button variant="outline">Open panel</Button>,
    children: (
      <>
        <PanelHeader
          title="Filters"
          action={
            <Button variant="ghost" size="sm">
              Clear all
            </Button>
          }
        />
        <PanelBody className="py-1.5">
          <PanelGroupLabel className="pt-1.5">Sector</PanelGroupLabel>
          {['Banks', 'IT', 'Pharma', 'Autos', 'FMCG', 'Metals'].map((label) => (
            <PanelItem key={label}>{label}</PanelItem>
          ))}
          <PanelSeparator />
          <PanelMessage>Six sectors on this list.</PanelMessage>
        </PanelBody>
      </>
    ),
  },
} satisfies Meta<typeof AdaptivePopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tablet and up: anchored to the trigger. */
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** Phone: a sheet across the bottom edge, with a grabber, inside the viewport. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open panel' }));
    const body = within(canvasElement.ownerDocument.body);
    const sheet = await body.findByRole('dialog', { name: 'Filters' });
    await waitFor(() => {
      const box = sheet.getBoundingClientRect();
      expect(Math.round(box.width)).toBe(window.innerWidth);
      expect(Math.round(box.bottom)).toBeLessThanOrEqual(window.innerHeight);
    });
  },
};

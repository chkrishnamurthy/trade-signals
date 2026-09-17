import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from '@/components/ui/input';
import { FormControl, FormDescription, FormField, FormLabel, FormMessage } from './form-field';

/**
 * The form field. It owns the control's `id`, `aria-describedby` and
 * `aria-invalid` via context, so a control wrapped in `<FormControl>` cannot get
 * them wrong. This is what `auth/*` and `profile/*` forms compose.
 */
const meta = {
  title: 'Features/Forms/FormField',
  component: FormField,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <FormField>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input type="email" placeholder="you@example.com" />
      </FormControl>
    </FormField>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <FormField>
      <FormLabel>New password</FormLabel>
      <FormControl>
        <Input type="password" />
      </FormControl>
      <FormDescription>
        At least 8 characters, with at least one letter and one number.
      </FormDescription>
    </FormField>
  ),
};

/** `invalid` drives the destructive border and reveals the `FormMessage`. */
export const Invalid: Story = {
  render: () => (
    <FormField invalid>
      <FormLabel>Confirm password</FormLabel>
      <FormControl>
        <Input type="password" defaultValue="mismatch" />
      </FormControl>
      <FormMessage>Passwords don't match.</FormMessage>
    </FormField>
  ),
};

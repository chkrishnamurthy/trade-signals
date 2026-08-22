import type { Metadata } from 'next';
import { DesignSystem } from '@/components/design-system/design-system';

export const metadata: Metadata = {
  title: 'Design system — Signal',
  description: 'Tokens, components and usage rules for the Signal interface.',
};

export default function DesignSystemPage() {
  return <DesignSystem />;
}

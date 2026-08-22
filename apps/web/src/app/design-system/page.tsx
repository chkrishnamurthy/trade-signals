import type { Metadata } from 'next';
import { DesignSystem } from '@/components/design-system/design-system';

export const metadata: Metadata = {
  title: 'Design system — WealthOS',
  description: 'Tokens, components and usage rules for the WealthOS interface.',
};

export default function DesignSystemPage() {
  return <DesignSystem />;
}

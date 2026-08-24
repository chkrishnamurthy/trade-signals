import type { Metadata } from 'next';
import { DesignSystem } from '@/components/design-system/design-system';

export const metadata: Metadata = {
  title: 'Design system — WealthOS',
  description:
    'Every token and shared component, rendered from the same imports a feature page uses.',
};

export default function DesignSystemPage() {
  return <DesignSystem />;
}

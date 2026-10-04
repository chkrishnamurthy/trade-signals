import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { StorybookConfig } from '@storybook/nextjs-vite';

const require = createRequire(import.meta.url);

/**
 * Storybook is the workbench and catalogue for the design system — it never
 * *owns* a component or a token, it renders them (see
 * `docs/planning/design-system-plan.md` §6). Scope is strictly `apps/web`; the
 * monorepo root and the headless worker are untouched.
 *
 * Stories are colocated with their components (`button.tsx` →
 * `button.stories.tsx`); `src/stories` holds only cross-cutting Foundations and
 * the shared fixtures library.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  core: { disableTelemetry: true },
  // Radix primitives (Popper/portal components) crash with "Invalid hook call"
  // when Vite's optimizer resolves a second copy of React in this pnpm
  // workspace. Pin react/react-dom to one resolved path so there is exactly one.
  viteFinal: async (viteConfig) => {
    const { mergeConfig } = await import('vite');
    return mergeConfig(viteConfig, {
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          react: dirname(require.resolve('react/package.json')),
          'react-dom': dirname(require.resolve('react-dom/package.json')),
        },
      },
    });
  },
};

export default config;

import * as WebBrowser from 'expo-web-browser';
import { Fragment } from 'react';
import { Card } from '@/components/Card';
import { Disclaimer } from '@/components/Disclaimer';
import { Divider, ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAppConfig } from '@/lib/app-config';
import { APP_VERSION, BUILD_NUMBER, WEBSITE_URL } from '@/lib/env';

const PAGES = [
  { path: '/terms', title: 'Terms of Use', icon: 'document-text-outline' },
  { path: '/privacy', title: 'Privacy Policy', icon: 'lock-closed-outline' },
  { path: '/disclaimer', title: 'Disclaimer', icon: 'alert-circle-outline' },
  { path: '/methodology', title: 'Methodology', icon: 'analytics-outline' },
  { path: '/data-sources', title: 'Data sources', icon: 'server-outline' },
  { path: '/contact', title: 'Contact', icon: 'mail-outline' },
] as const;

/** Legal copy lives once, on the website; the app links to it (R8). */
export default function AboutScreen() {
  const config = useAppConfig();
  return (
    <Screen>
      <Card>
        {PAGES.map((page, i) => (
          <Fragment key={page.path}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              icon={page.icon}
              title={page.title}
              onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE_URL}${page.path}`)}
            />
          </Fragment>
        ))}
      </Card>
      <Disclaimer />
      <Text variant="caption" color="subtle" style={{ textAlign: 'center' }}>
        Version {APP_VERSION} (build {BUILD_NUMBER})
        {config.data ? ` · terms ${config.data.termsVersion}` : ''}
      </Text>
    </Screen>
  );
}

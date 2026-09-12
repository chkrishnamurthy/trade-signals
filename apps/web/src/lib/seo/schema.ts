/**
 * Type-safe JSON-LD structured data generators for EquityWise.io.
 *
 * Implements Schema.org standard schemas to maximize Google Search visibility,
 * entity recognition in Google Knowledge Graph, and rich snippet eligibility.
 */

export const SITE_URL = 'https://equitywise.io';
export const SITE_NAME = 'EquityWise';
export const SITE_DESCRIPTION =
  'Technical analysis, tracking, and screening platform for National Stock Exchange (NSE) equities.';

export interface BreadcrumbItem {
  readonly name: string;
  readonly path: string;
}

export interface OrganizationSchema {
  '@type': 'Organization';
  '@id': string;
  name: string;
  url: string;
  logo: {
    '@type': 'ImageObject';
    url: string;
    width: number;
    height: number;
  };
  description: string;
  sameAs: string[];
}

export interface WebSiteSchema {
  '@type': 'WebSite';
  '@id': string;
  url: string;
  name: string;
  publisher: { '@id': string };
  description: string;
  potentialAction: {
    '@type': 'SearchAction';
    target: {
      '@type': 'EntryPoint';
      urlTemplate: string;
    };
    'query-input': string;
  };
}

export interface OrganizationAndWebSiteGraph {
  '@context': 'https://schema.org';
  '@graph': [OrganizationSchema, WebSiteSchema];
}

/**
 * Global Organization and WebSite schema graph for the root layout / homepage.
 */
export function generateOrganizationAndWebsiteSchema(): OrganizationAndWebSiteGraph {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/brand-mark.png`,
          width: 512,
          height: 512,
        },
        description: SITE_DESCRIPTION,
        sameAs: [],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { '@id': `${SITE_URL}/#organization` },
        description: SITE_DESCRIPTION,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/stocks?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

/**
 * BreadcrumbList schema.
 */
export function generateBreadcrumbSchema(items: readonly BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.path.startsWith('http') ? item.path : `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * Corporation / Financial entity schema for individual stock pages.
 */
export function generateStockSchema(stock: {
  readonly symbol: string;
  readonly name: string;
  readonly sector?: string | null;
  readonly exchange?: string;
  readonly isin?: string | null;
  readonly description?: string;
}) {
  const url = `${SITE_URL}/stocks/${stock.symbol.toLowerCase()}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Corporation',
    name: stock.name,
    tickerSymbol: `${stock.exchange ?? 'NSE'}:${stock.symbol}`,
    url,
    ...(stock.isin ? { isin: stock.isin } : {}),
    ...(stock.description ? { description: stock.description } : {}),
    mainEntityOfPage: {
      '@type': 'ItemPage',
      '@id': url,
    },
  };
}

/**
 * ItemList schema for screener presets, sector constituent lists, and stock directories.
 */
export function generateItemListSchema(data: {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly items: readonly { readonly name: string; readonly url: string }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: data.name,
    description: data.description,
    url: data.url.startsWith('http') ? data.url : `${SITE_URL}${data.url}`,
    numberOfItems: data.items.length,
    itemListElement: data.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}

/**
 * FAQPage schema for technical stock Q&A and methodology explanations.
 */
export function generateFaqSchema(
  faqs: readonly { readonly question: string; readonly answer: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

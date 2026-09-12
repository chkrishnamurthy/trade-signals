import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap, { SCREENER_PRESETS } from '@/app/sitemap';
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  generateItemListSchema,
  generateOrganizationAndWebsiteSchema,
  generateStockSchema,
  SITE_NAME,
  SITE_URL,
} from './schema';

describe('SEO Schema Generators', () => {
  it('generates valid Organization and WebSite graph schema', () => {
    const schema = generateOrganizationAndWebsiteSchema();
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@graph']).toHaveLength(2);

    const [org, website] = schema['@graph'];
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe(SITE_NAME);
    expect(org.url).toBe(SITE_URL);
    expect(org.logo.url).toBe(`${SITE_URL}/brand-mark.png`);

    expect(website['@type']).toBe('WebSite');
    expect(website.url).toBe(SITE_URL);
    expect(website.potentialAction['@type']).toBe('SearchAction');
  });

  it('generates 1-indexed BreadcrumbList schema with normalized URLs', () => {
    const items = [
      { name: 'Home', path: '/' },
      { name: 'Stocks', path: '/stocks' },
      { name: 'Tata Power', path: '/stocks/tatapower' },
    ];
    const schema = generateBreadcrumbSchema(items);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(3);
    expect(schema.itemListElement[0]!).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: `${SITE_URL}/`,
    });
    expect(schema.itemListElement[2]!).toEqual({
      '@type': 'ListItem',
      position: 3,
      name: 'Tata Power',
      item: `${SITE_URL}/stocks/tatapower`,
    });
  });

  it('generates Corporation schema for stock pages', () => {
    const schema = generateStockSchema({
      symbol: 'TATAPOWER',
      name: 'Tata Power Company Ltd',
      sector: 'Energy',
      isin: 'INE245A01021',
    });
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Corporation');
    expect(schema.name).toBe('Tata Power Company Ltd');
    expect(schema.tickerSymbol).toBe('NSE:TATAPOWER');
    expect(schema.isin).toBe('INE245A01021');
    expect(schema.url).toBe(`${SITE_URL}/stocks/tatapower`);
  });

  it('generates ItemList schema for directories and screeners', () => {
    const items = [
      { name: 'Stock A', url: '/stocks/a' },
      { name: 'Stock B', url: '/stocks/b' },
    ];
    const schema = generateItemListSchema({
      name: 'Test List',
      description: 'Test Description',
      url: '/test',
      items,
    });
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('ItemList');
    expect(schema.numberOfItems).toBe(2);
    expect(schema.itemListElement[0]!.position).toBe(1);
    expect(schema.itemListElement[0]!.url).toBe(`${SITE_URL}/stocks/a`);
  });

  it('generates FAQPage schema for technical stock Q&A', () => {
    const faqs = [
      { question: 'What is the 52W High?', answer: '₹450.00' },
      { question: 'What is the RSI?', answer: '62.5' },
    ];
    const schema = generateFaqSchema(faqs);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema.mainEntity[0]!.name).toBe('What is the 52W High?');
    expect(schema.mainEntity[0]!.acceptedAnswer.text).toBe('₹450.00');
  });
});

describe('Robots Configuration', () => {
  it('allows crawling of public research hubs while disallowing private surfaces', () => {
    const config = robots();
    expect(config.sitemap).toBe(`${SITE_URL}/sitemap.xml`);

    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules).toBeDefined();
    expect(rules!.userAgent).toBe('*');

    const allowList = Array.isArray(rules!.allow) ? rules!.allow : [rules!.allow];
    expect(allowList).toContain('/');
    expect(allowList).toContain('/stocks');
    expect(allowList).toContain('/screener');
    expect(allowList).toContain('/sectors');
    expect(allowList).toContain('/about');
    expect(allowList).toContain('/methodology');
    expect(allowList).toContain('/disclaimer');

    const disallowList = Array.isArray(rules!.disallow) ? rules!.disallow : [rules!.disallow];
    expect(disallowList).toContain('/api/');
    expect(disallowList).toContain('/admin');
    expect(disallowList).toContain('/watchlists');
    expect(disallowList).toContain('/profile');
    expect(disallowList).toContain('/login');
    expect(disallowList).toContain('/signup');
  });
});

describe('Sitemap Generation', () => {
  it('produces valid XML sitemap entries with priority and changeFrequency', async () => {
    const items = await sitemap();
    expect(items.length).toBeGreaterThan(15);

    // Root homepage
    const homeEntry = items.find((e) => e.url === SITE_URL);
    expect(homeEntry).toBeDefined();
    expect(homeEntry?.priority).toBe(1.0);
    expect(homeEntry?.changeFrequency).toBe('daily');

    // Public hubs
    expect(items.some((e) => e.url === `${SITE_URL}/stocks`)).toBe(true);
    expect(items.some((e) => e.url === `${SITE_URL}/screener`)).toBe(true);
    expect(items.some((e) => e.url === `${SITE_URL}/sectors`)).toBe(true);
    expect(items.some((e) => e.url === `${SITE_URL}/about`)).toBe(true);
    expect(items.some((e) => e.url === `${SITE_URL}/methodology`)).toBe(true);

    // Screener presets
    for (const preset of SCREENER_PRESETS) {
      expect(items.some((e) => e.url === `${SITE_URL}/screener/${preset.slug}`)).toBe(true);
    }

    // No private URLs should ever appear in the sitemap
    for (const entry of items) {
      expect(entry.url).not.toContain('/api/');
      expect(entry.url).not.toContain('/admin');
      expect(entry.url).not.toContain('/watchlists');
      expect(entry.url).not.toContain('/profile');
      expect(entry.url).not.toContain('/login');
      expect(entry.url).not.toContain('/signup');
      expect(entry.url).not.toContain('?');
    }
  });
});

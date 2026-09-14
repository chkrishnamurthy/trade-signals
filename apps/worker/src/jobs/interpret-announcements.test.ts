import { expect, it } from 'vitest';
import { withAnnouncementInterpretation } from './interpret-announcements.js';

const row = {
  source: 'bse',
  externalId: 'example',
  instrumentId: null,
  symbol: '500000',
  companyName: 'Example',
  category: null,
  headline: 'Dividend',
  detail: 'Dividend per share: ₹2',
  attachmentUrl: null,
  announcedAt: new Date('2026-09-14T10:00:00Z'),
};
it('versions source changes without changing the identity of a retry', () => {
  const a = withAnnouncementInterpretation(row);
  expect(withAnnouncementInterpretation(row).interpretationChecksum).toBe(a.interpretationChecksum);
  expect(
    withAnnouncementInterpretation({ ...row, detail: 'Dividend per share: ₹3' })
      .interpretationChecksum,
  ).not.toBe(a.interpretationChecksum);
  expect(a.interpretationChecksum).toMatch(/^[a-f0-9]{64}$/);
});

it('does not pass a database identity into reprocessing inserts', () => {
  const stored = { ...row, id: 42, ingestedAt: new Date() };
  expect(withAnnouncementInterpretation(stored)).not.toHaveProperty('id');
  expect(withAnnouncementInterpretation(stored)).not.toHaveProperty('ingestedAt');
});

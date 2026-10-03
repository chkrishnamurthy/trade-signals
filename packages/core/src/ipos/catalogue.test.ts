import { describe, expect, it } from 'vitest';
import { readableCompanyName } from './catalogue.js';

describe('readableCompanyName', () => {
  it('reads an all-caps SEBI filing name in readable case', () => {
    expect(readableCompanyName('JAGATJIT AGRI ENGINEERING LIMITED')).toBe(
      'Jagatjit Agri Engineering Limited',
    );
    expect(readableCompanyName('EKKAA ELECTRONICS (INDIA) LIMITED')).toBe(
      'Ekkaa Electronics (India) Limited',
    );
    expect(readableCompanyName('SRIT INDIA LIMITED')).toBe('Srit India Limited');
  });
  it('keeps initials, small joining words and digits as they should read', () => {
    expect(readableCompanyName('JSW IT SERVICES PVT. LTD.')).toBe('JSW IT Services Pvt. Ltd.');
    expect(readableCompanyName('BANK OF THE WEST AND CO')).toBe('Bank of the West and Co');
    expect(readableCompanyName('C2C ADVANCED SYSTEMS LLP')).toBe('C2C Advanced Systems LLP');
    expect(readableCompanyName("SHAH INVESTOR'S HOME LIMITED")).toBe(
      "Shah Investor's Home Limited",
    );
  });
  it('leaves a name that already has lowercase letters alone', () => {
    expect(readableCompanyName('Arohan Financial Services Limited')).toBe(
      'Arohan Financial Services Limited',
    );
    expect(readableCompanyName('AceVector Limited')).toBe('AceVector Limited');
  });
});

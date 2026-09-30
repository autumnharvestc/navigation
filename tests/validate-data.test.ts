import { describe, expect, it } from 'vitest';
import { validateDataset } from '../src/domain/validate';

const country = {
  code: 'CN',
  name: '中国大陆',
  level: 'country' as const,
  parentCode: null,
  sort: 0,
};
const province = {
  code: '110000',
  name: '北京市',
  level: 'province' as const,
  parentCode: 'CN',
  sort: 1,
};
const agency = {
  id: '110000-government-beijing-gov-cn',
  regionCode: '110000',
  name: '北京市人民政府',
  siteName: '北京市人民政府门户网站',
  url: 'https://www.beijing.gov.cn/',
  category: 'government' as const,
  sourceUrl: 'https://www.beijing.gov.cn/',
};

describe('validateDataset', () => {
  it('accepts a valid hierarchy and agency', () => {
    const result = validateDataset({ regions: [country, province], agencies: [agency] });
    expect(result.errors).toEqual([]);
  });

  it('rejects duplicate ids, duplicate urls and orphan regions', () => {
    const orphan = {
      ...province,
      code: '110100',
      name: '某市',
      level: 'city' as const,
      parentCode: '999999',
    };
    const result = validateDataset({
      regions: [country, province, orphan],
      agencies: [agency, { ...agency, id: 'duplicate-url' }, { ...agency, id: 'duplicate-id' }],
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate agency url'),
        expect.stringContaining('missing parent 999999'),
      ]),
    );
  });

  it('rejects invalid urls, unknown categories and wrong parent levels', () => {
    const wrongLevel = {
      ...province,
      code: '110100',
      name: '某市',
      level: 'county' as const,
      parentCode: '110000',
    };
    const result = validateDataset({
      regions: [country, province, wrongLevel],
      agencies: [{ ...agency, url: 'not-a-url', category: 'unknown' as never }],
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('url'),
        expect.stringContaining('category'),
        expect.stringContaining('parent 110000 must have level city'),
      ]),
    );
  });
});

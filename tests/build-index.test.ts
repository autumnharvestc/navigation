import { describe, expect, it } from 'vitest';
import { toSearchDocument } from '../src/data/build-index';

describe('toSearchDocument', () => {
  it('creates a compact, searchable and serializable record', () => {
    const document = toSearchDocument(
      {
        id: '110000-government-beijing',
        regionCode: '110000',
        name: '北京市人民政府',
        siteName: '北京市人民政府门户网站',
        url: 'https://www.beijing.gov.cn/',
        category: 'government',
        sourceUrl: 'https://www.beijing.gov.cn/',
      },
      { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
    );

    expect(document).toEqual({
      id: '110000-government-beijing',
      name: '北京市人民政府',
      siteName: '北京市人民政府门户网站',
      regionCode: '110000',
      regionName: '北京市',
      level: 'province',
      category: 'government',
      domain: 'www.beijing.gov.cn',
      url: 'https://www.beijing.gov.cn/',
      sourceUrl: 'https://www.beijing.gov.cn/',
    });
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
});

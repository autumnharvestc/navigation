import { describe, expect, it } from 'vitest';
import { createSearchEngine, searchDocuments } from '../src/data/search';
import type { SearchDocument } from '../src/data/build-index';

const documents = [
  {
    id: 'a',
    name: '北京市人民政府',
    siteName: '北京市人民政府门户网站',
    regionCode: '110000',
    regionName: '北京市',
    level: 'province',
    category: 'government',
    domain: 'www.beijing.gov.cn',
    url: 'https://www.beijing.gov.cn/',
    sourceUrl: 'https://www.beijing.gov.cn/',
  },
  {
    id: 'b',
    name: '北京市高级人民法院',
    siteName: '北京市高级人民法院',
    regionCode: '110000',
    regionName: '北京市',
    level: 'province',
    category: 'court',
    domain: 'bjgy.bjcourt.gov.cn',
    url: 'https://bjgy.bjcourt.gov.cn/',
    sourceUrl: 'https://bjgy.bjcourt.gov.cn/',
  },
] satisfies SearchDocument[];

describe('client-side search', () => {
  it('matches ranked Chinese terms across document fields', () => {
    expect(searchDocuments(createSearchEngine(documents), '北京 法院', {})).toEqual([documents[1]]);
  });

  it('returns all documents for an empty query without filters', () => {
    expect(searchDocuments(createSearchEngine(documents), '', {})).toEqual(documents);
  });

  it('returns all documents matching filters for an empty query', () => {
    expect(
      searchDocuments(createSearchEngine(documents), '', {
        level: 'province',
        category: 'government',
      }),
    ).toEqual([documents[0]]);
  });

  it('matches domain terms', () => {
    expect(searchDocuments(createSearchEngine(documents), 'bjcourt', {})).toEqual([documents[1]]);
  });

  it('filters by region code', () => {
    expect(
      searchDocuments(createSearchEngine(documents), '北京', { regionCode: '120000' }),
    ).toEqual([]);
  });
});

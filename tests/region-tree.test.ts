import { describe, expect, it } from 'vitest';
import { createRegionIndex } from '../src/domain/region-tree';

const regions = [
  { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
  { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
  { code: '110100', name: '市辖区', level: 'city', parentCode: '110000', sort: 1 },
  { code: '110101', name: '东城区', level: 'county', parentCode: '110100', sort: 1 },
] as const;

describe('createRegionIndex', () => {
  it('finds children and ancestors in order', () => {
    const index = createRegionIndex([...regions]);
    expect(index.children('CN').map((item) => item.code)).toEqual(['110000']);
    expect(index.ancestors('110101').map((item) => item.code)).toEqual(['CN', '110000', '110100']);
  });

  it('finds the province owner for city and county codes', () => {
    const index = createRegionIndex([...regions]);
    expect(index.provinceOf('110101')?.code).toBe('110000');
    expect(index.provinceOf('110000')?.code).toBe('110000');
  });
});

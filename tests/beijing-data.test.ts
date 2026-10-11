import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

const expectedDistricts = [
  { code: '110101', name: '东城区', sort: 1 },
  { code: '110102', name: '西城区', sort: 2 },
  { code: '110105', name: '朝阳区', sort: 3 },
  { code: '110106', name: '丰台区', sort: 4 },
  { code: '110107', name: '石景山区', sort: 5 },
  { code: '110108', name: '海淀区', sort: 6 },
  { code: '110109', name: '门头沟区', sort: 7 },
  { code: '110111', name: '房山区', sort: 8 },
  { code: '110112', name: '通州区', sort: 9 },
  { code: '110113', name: '顺义区', sort: 10 },
  { code: '110114', name: '昌平区', sort: 11 },
  { code: '110115', name: '大兴区', sort: 12 },
  { code: '110116', name: '怀柔区', sort: 13 },
  { code: '110117', name: '平谷区', sort: 14 },
  { code: '110118', name: '密云区', sort: 15 },
  { code: '110119', name: '延庆区', sort: 16 },
] as const;

const expectedDistrictCodes = new Set<string>(expectedDistricts.map((district) => district.code));

async function readData<T>(path: string): Promise<T> {
  const content = await readFile(join(process.cwd(), 'data', path), 'utf8');
  return JSON.parse(content) as T;
}

describe('Beijing municipal data', () => {
  it('adds the municipal grouping and all county-level districts', async () => {
    const regions = await readData<Region[]>('regions.json');

    expect(regions.find((region) => region.code === '110100')).toEqual({
      code: '110100',
      name: '市辖区',
      level: 'city',
      parentCode: '110000',
      sort: 1,
    });

    for (const expected of expectedDistricts) {
      expect(regions.find((region) => region.code === expected.code)).toEqual({
        ...expected,
        level: 'county',
        parentCode: '110100',
      });
    }

    expect(regions.filter((region) => expectedDistrictCodes.has(region.code))).toHaveLength(
      expectedDistricts.length,
    );
  });

  it('adds exactly one government portal record for each district', async () => {
    const agencies = await readData<AgencyRecord[]>('provinces/110000.json');
    const districtAgencies = agencies.filter((agency) =>
      expectedDistrictCodes.has(agency.regionCode),
    );

    expect(districtAgencies).toHaveLength(expectedDistricts.length);

    for (const district of expectedDistricts) {
      expect(
        districtAgencies.filter(
          (agency) => agency.regionCode === district.code && agency.category === 'government',
        ),
      ).toHaveLength(1);
    }

    expect(agencies).toContainEqual(
      expect.objectContaining({
        id: '110000-government-beijing-gov-cn',
        regionCode: '110000',
        url: 'https://www.beijing.gov.cn/',
        category: 'government',
      }),
    );
  });

  it('uses unique HTTPS URLs for all district portals', async () => {
    const agencies = await readData<AgencyRecord[]>('provinces/110000.json');
    const districtAgencies = agencies.filter((agency) =>
      expectedDistrictCodes.has(agency.regionCode),
    );

    expect(districtAgencies).toHaveLength(expectedDistricts.length);

    const urls = districtAgencies.map((agency) => agency.url);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });
});

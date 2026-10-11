import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

const cityProvinceCodeSet = new Set(['130000', '140000', '150000', '210000', '220000', '230000']);
const sourceByProvince = new Map<string, string>([
  ['120000', 'https://www.tj.gov.cn/'],
  ['130000', 'https://www.hebei.gov.cn/'],
  ['140000', 'https://www.shanxi.gov.cn/'],
  ['150000', 'https://www.nmg.gov.cn/'],
  ['210000', 'https://www.ln.gov.cn/'],
  ['220000', 'https://www.jl.gov.cn/xglj/szfbmszxszf/'],
  ['230000', 'https://www.hlj.gov.cn/'],
]);

async function readData<T>(path: string): Promise<T> {
  const content = await readFile(join(process.cwd(), 'data', path), 'utf8');
  return JSON.parse(content) as T;
}

function provinceCode(regionCode: string): string {
  return `${regionCode.slice(0, 2)}0000`;
}

function expectedGovernmentName(region: Region): string {
  if (region.name.endsWith('盟') || region.name.endsWith('地区')) {
    return `${region.name}行政公署`;
  }
  if (region.parentCode === '120100') {
    return `天津市${region.name}人民政府`;
  }
  return `${region.name}人民政府`;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

describe('north and northeast city portals', () => {
  it('provides exactly one government record for each of the 86 target regions', async () => {
    const regions = await readData<Region[]>('regions.json');
    const batchCities = regions.filter(
      (region) => region.level === 'city' && cityProvinceCodeSet.has(region.parentCode ?? ''),
    );
    const tianjinDistricts = regions.filter(
      (region) => region.level === 'county' && region.parentCode === '120100',
    );
    const expectedRegions = [...batchCities, ...tianjinDistricts];

    expect(batchCities, 'expected 70 prefecture-level regions').toHaveLength(70);
    expect(tianjinDistricts, 'expected 16 Tianjin districts').toHaveLength(16);
    expect(expectedRegions, 'expected 86 target regions').toHaveLength(86);

    const agencies = (
      await Promise.all(
        ['120000', '130000', '140000', '150000', '210000', '220000', '230000'].map((code) =>
          readData<AgencyRecord[]>(`provinces/${code}.json`),
        ),
      )
    ).flat();
    const batchAgencies = agencies.filter((agency) =>
      expectedRegions.some((region) => region.code === agency.regionCode),
    );

    expect(batchAgencies, 'expected 86 government portal records').toHaveLength(86);

    const missing = expectedRegions
      .filter((region) => !batchAgencies.some((agency) => agency.regionCode === region.code))
      .map((region) => region.code);
    expect(missing, `missing government records: ${missing.join(', ')}`).toEqual([]);

    const wrongCounts = expectedRegions
      .map((region) => ({
        code: region.code,
        count: batchAgencies.filter((agency) => agency.regionCode === region.code).length,
      }))
      .filter(({ count }) => count !== 1);
    expect(
      wrongCounts,
      `regions without exactly one record: ${JSON.stringify(wrongCounts)}`,
    ).toEqual([]);

    expect(
      batchAgencies.filter((agency) => agency.category !== 'government').map((agency) => agency.id),
    ).toEqual([]);
  });

  it('matches the required per-province counts', async () => {
    const expectedCounts = new Map<string, number>([
      ['120000', 16],
      ['130000', 11],
      ['140000', 11],
      ['150000', 12],
      ['210000', 14],
      ['220000', 9],
      ['230000', 13],
    ]);
    const regions = await readData<Region[]>('regions.json');
    const targetCodes = new Set(
      regions
        .filter(
          (region) =>
            (region.level === 'city' && cityProvinceCodeSet.has(region.parentCode ?? '')) ||
            (region.level === 'county' && region.parentCode === '120100'),
        )
        .map((region) => region.code),
    );

    for (const [code, expected] of expectedCounts) {
      const agencies = await readData<AgencyRecord[]>(`provinces/${code}.json`);
      const targetAgencies = agencies.filter(
        (agency) => targetCodes.has(agency.regionCode) && provinceCode(agency.regionCode) === code,
      );
      expect(targetAgencies, `${code} should have ${expected} records`).toHaveLength(expected);
    }
  });

  it('uses region-appropriate names and traceable URL fields', async () => {
    const regions = await readData<Region[]>('regions.json');
    const batchCities = regions.filter(
      (region) => region.level === 'city' && cityProvinceCodeSet.has(region.parentCode ?? ''),
    );
    const tianjinDistricts = regions.filter(
      (region) => region.level === 'county' && region.parentCode === '120100',
    );
    const expectedRegions = [...batchCities, ...tianjinDistricts];
    const agencies = (
      await Promise.all(
        ['120000', '130000', '140000', '150000', '210000', '220000', '230000'].map((code) =>
          readData<AgencyRecord[]>(`provinces/${code}.json`),
        ),
      )
    ).flat();
    const recordsByCode = new Map(
      agencies
        .filter((agency) => expectedRegions.some((region) => region.code === agency.regionCode))
        .map((agency) => [agency.regionCode, agency]),
    );

    for (const region of expectedRegions) {
      const record = recordsByCode.get(region.code);
      expect(record, `missing record for ${region.code}`).toBeDefined();
      expect(record?.name, `wrong name for ${region.code}`).toBe(expectedGovernmentName(region));
      expect(record?.url, `invalid url for ${region.code}`).toMatch(/^https?:\/\//);
      expect(record?.sourceUrl, `invalid sourceUrl for ${region.code}`).toMatch(/^https?:\/\//);
      expect(
        record?.sourceUrl,
        `source does not identify the parent government portal for ${region.code}`,
      ).toBe(sourceByProvince.get(provinceCode(region.code)));
      expect(() => new URL(record?.url ?? '')).not.toThrow();
      expect(() => new URL(record?.sourceUrl ?? '')).not.toThrow();
    }
  });

  it('keeps IDs and URLs globally unique across all published data', async () => {
    const files = (await readdir(join(process.cwd(), 'data', 'provinces')))
      .filter((file) => file.endsWith('.json'))
      .sort();
    const records = (
      await Promise.all(files.map((file) => readData<AgencyRecord[]>(`provinces/${file}`)))
    ).flat();

    expect(duplicateValues(records.map((record) => record.id)), 'duplicate IDs').toEqual([]);
    expect(
      duplicateValues(records.map((record) => record.url.replace(/\/$/, '').toLowerCase())),
      'duplicate URLs',
    ).toEqual([]);
  });
});

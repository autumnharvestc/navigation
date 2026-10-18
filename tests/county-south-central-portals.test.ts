import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type SourceKind = 'city-directory' | 'official-directory' | 'official-self' | 'wikidata';

type GoldenEntry = {
  regionCode: string;
  regionName: string;
  level: Region['level'];
  parentCode: string | null;
  expected: boolean;
  blankReason?: string;
  id?: string;
  agencyName?: string;
  siteName?: string;
  url?: string;
  sourceUrl?: string;
  sourceKind?: SourceKind;
  verificationUrl?: string;
  wikidataItem?: string;
  anchorText?: string;
  p856Snapshot?: string;
  p856CheckedAt?: string;
};

type SourceMapping = {
  regionCode: string;
  regionName: string;
  targetUrl: string;
  targetHost: string;
  sourceKind: SourceKind;
  verificationUrl?: string;
  wikidataItem?: string;
  anchorText?: string;
  p856Snapshot?: string;
  p856CheckedAt?: string;
};

type SourceEvidence = {
  sourceUrl: string;
  sourceTitle: string;
  sourceKind: SourceKind;
  checkedAt: string;
  httpStatus: number | null;
  verificationMethod: string;
  statusNote: string;
  targetMappings: SourceMapping[];
};

type SourceFixture = {
  checkedAt: string;
  maintenance: string;
  sources: SourceEvidence[];
};

const provinceFiles = ['420000', '430000', '440000', '450000', '460000'];
const expectedByProvince: Record<string, number> = {
  '42': 99,
  '43': 122,
  '44': 122,
  '45': 111,
  '46': 10,
};
const alreadyCoveredCountyCodes = new Set([
  '429004',
  '429005',
  '429006',
  '429021',
  '469001',
  '469002',
  '469005',
  '469006',
  '469007',
  '469021',
  '469022',
  '469023',
  '469024',
  '469025',
  '469026',
  '469027',
  '469028',
  '469029',
  '469030',
]);
const blankCodes = new Set(['460202', '460203', '460204', '460302', '460303']);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function canonicalName(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, '')
    .replace(/(人民政府|政府网站|政府|管委会|管理委员会|行政公署)$/, '')
    .replace(/(满族自治县|蒙古族自治县|自治县|县|区|市)$/, '');
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

async function loadGolden(): Promise<GoldenEntry[]> {
  return readJson<GoldenEntry[]>(
    join('tests', 'fixtures', 'county-south-central-portals.golden.json'),
  );
}

async function loadSources(): Promise<SourceFixture> {
  return readJson<SourceFixture>(
    join('tests', 'fixtures', 'county-south-central-portal-sources.json'),
  );
}

async function loadProvinceRecords(): Promise<AgencyRecord[]> {
  const records = await Promise.all(
    provinceFiles.map((file) =>
      readJson<AgencyRecord[]>(join('data', 'provinces', `${file}.json`)),
    ),
  );
  return records.flat();
}

describe('south and central county portals', () => {
  it('locks all 464 targets and exact per-province counts', async () => {
    const golden = await loadGolden();
    const regions = await readJson<Region[]>(join('data', 'regions.json'));
    const regionByCode = new Map(regions.map((region) => [region.code, region]));
    const expectedCodes = regions
      .filter(
        (region) =>
          region.level === 'county' &&
          provinceFiles.includes(`${region.code.slice(0, 2)}0000`) &&
          !alreadyCoveredCountyCodes.has(region.code),
      )
      .map((region) => region.code);

    expect(golden).toHaveLength(464);
    expect(new Set(golden.map((entry) => entry.regionCode))).toEqual(new Set(expectedCodes));
    expect(duplicateValues(golden.map((entry) => entry.regionCode))).toEqual([]);
    expect(golden.filter((entry) => !entry.expected).map((entry) => entry.regionCode)).toEqual([
      ...blankCodes,
    ]);

    for (const [prefix, expected] of Object.entries(expectedByProvince)) {
      expect(golden.filter((entry) => entry.regionCode.startsWith(prefix))).toHaveLength(expected);
    }

    for (const entry of golden) {
      const region = regionByCode.get(entry.regionCode);
      expect(region).toBeDefined();
      expect(entry).toMatchObject({
        regionName: region?.name,
        level: region?.level,
        parentCode: region?.parentCode,
      });

      if (!entry.expected) {
        expect(blankCodes.has(entry.regionCode)).toBe(true);
        expect(entry.blankReason).toBeTruthy();
        expect(entry.id).toBeUndefined();
        expect(entry.url).toBeUndefined();
        continue;
      }

      expect(entry.agencyName).toBe(`${region?.name}人民政府`);
      expect(entry.siteName).toBe(entry.agencyName);
      expect(entry.id).toBeTruthy();
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(['city-directory', 'official-directory', 'official-self', 'wikidata']).toContain(
        entry.sourceKind,
      );

      if (entry.sourceKind === 'wikidata') {
        expect(entry.verificationUrl).toBe(entry.sourceUrl);
        expect(new URL(entry.p856Snapshot ?? '').hostname).toBe(new URL(entry.url ?? '').hostname);
        expect(entry.p856CheckedAt).toBeTruthy();
      } else {
        expect(entry.anchorText).toBeTruthy();
        expect(canonicalName(entry.anchorText).endsWith(canonicalName(entry.regionName))).toBe(
          true,
        );
        expect(canonicalName(entry.anchorText)).not.toMatch(
          /走进|活动|公告|座谈|会议|新闻|调研|项目|工作|报道|科技|小院/,
        );
      }
    }
  });

  it('matches every expected record and leaves only documented targets blank', async () => {
    const golden = await loadGolden();
    const goldenByCode = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const records = await loadProvinceRecords();
    const targetRecords = records.filter((record) => goldenByCode.has(record.regionCode));
    expect(targetRecords).toHaveLength(459);

    for (const actual of targetRecords) {
      const expected = goldenByCode.get(actual.regionCode);
      expect(expected?.expected).toBe(true);
      expect(actual).toEqual({
        id: expected?.id,
        regionCode: actual.regionCode,
        name: expected?.agencyName,
        siteName: expected?.siteName,
        url: expected?.url,
        category: 'government',
        sourceUrl: expected?.sourceUrl,
      });
    }

    for (const code of blankCodes) {
      expect(records.filter((record) => record.regionCode === code)).toEqual([]);
    }
  });

  it('locks source evidence and all source host mappings', async () => {
    const golden = await loadGolden();
    const fixture = await loadSources();
    const expected = golden.filter((entry) => entry.expected);
    const expectedByCode = new Map(expected.map((entry) => [entry.regionCode, entry]));
    const mappedCodes = new Set<string>();

    expect(fixture.checkedAt).toBeTruthy();
    expect(fixture.maintenance).toContain('固定候选来源');
    expect(new Set(fixture.sources.map((source) => source.sourceUrl))).toEqual(
      new Set(expected.map((entry) => entry.sourceUrl)),
    );

    for (const source of fixture.sources) {
      expect(source.sourceTitle).not.toBe('');
      expect(source.checkedAt).toBe(fixture.checkedAt);
      expect(source.verificationMethod).not.toBe('');
      expect(source.statusNote).not.toBe('');
      expect(source.httpStatus === null || Number.isInteger(source.httpStatus)).toBe(true);
      expect(['city-directory', 'official-directory', 'official-self', 'wikidata']).toContain(
        source.sourceKind,
      );

      for (const mapping of source.targetMappings) {
        mappedCodes.add(mapping.regionCode);
        const entry = expectedByCode.get(mapping.regionCode);
        expect(entry).toBeDefined();
        expect(mapping.regionName).toBe(entry?.regionName);
        expect(mapping.targetUrl).toBe(entry?.url);
        expect(new URL(mapping.targetUrl).hostname).toBe(mapping.targetHost);
        expect(mapping.sourceKind).toBe(entry?.sourceKind);

        if (mapping.sourceKind === 'wikidata') {
          expect(mapping.wikidataItem ?? mapping.verificationUrl).toBe(entry?.verificationUrl);
          expect(new URL(mapping.p856Snapshot ?? '').hostname).toBe(
            new URL(entry?.p856Snapshot ?? '').hostname,
          );
          expect(mapping.p856CheckedAt).toBe(entry?.p856CheckedAt);
        } else {
          expect(mapping.anchorText).toBeTruthy();
          expect(canonicalName(mapping.anchorText).endsWith(canonicalName(entry?.regionName))).toBe(
            true,
          );
          expect(canonicalName(mapping.anchorText)).not.toMatch(
            /走进|活动|公告|座谈|会议|新闻|调研|项目|工作|报道|科技|小院/,
          );
          expect(mapping.p856Snapshot).toBeUndefined();
        }
      }
    }

    expect(mappedCodes).toEqual(new Set(expected.map((entry) => entry.regionCode)));
    expect(duplicateValues(expected.map((entry) => entry.id ?? ''))).toEqual([]);
    expect(duplicateValues(expected.map((entry) => entry.url ?? ''))).toEqual([]);
    expect(duplicateValues(expected.map((entry) => new URL(entry.url ?? '').hostname))).toEqual([]);
  });

  it('locks corrected and non-Wikidata official portals', async () => {
    const golden = await loadGolden();
    const records = await loadProvinceRecords();
    const actual = new Map(records.map((record) => [record.regionCode, record]));
    const expected = new Map(golden.map((entry) => [entry.regionCode, entry]));

    const fixed = new Map([
      ['420626', 'https://www.baokang.gov.cn/'],
      ['422823', 'http://www.hbbd.gov.cn/'],
      ['430523', 'http://www.syx.gov.cn/'],
      ['431081', 'http://www.zixing.gov.cn/'],
      ['440310', 'https://www.szpsq.gov.cn/'],
      ['450303', 'http://www.glsdcqzf.gov.cn/'],
      ['430112', 'http://www.wangcheng.gov.cn/'],
      ['451022', 'http://www.gxtd.gov.cn/'],
      ['451223', 'http://www.gxfsx.gov.cn/'],
      ['451224', 'http://www.donglan.gov.cn/'],
      ['441423', 'https://www.fengshun.gov.cn/'],
    ]);

    for (const [code, url] of fixed) {
      expect(expected.get(code)).toMatchObject({
        expected: true,
        url,
        sourceKind: 'official-self',
      });
      expect(actual.get(code)).toMatchObject({ url, sourceUrl: url });
    }

    expect(expected.get('430802')).toMatchObject({
      expected: true,
      url: 'http://www.zjjyd.gov.cn/',
      sourceKind: 'wikidata',
    });
  });
});

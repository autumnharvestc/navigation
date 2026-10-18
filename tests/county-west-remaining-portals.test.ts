import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type SourceKind = 'city-directory' | 'official-self' | 'wikidata';

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
  anchorText?: string;
  verificationUrl?: string;
  wikidataItem?: string;
  p856Snapshot?: string;
  p856CheckedAt?: string;
  targetHttpStatus: number | null;
  targetStatusNote: string;
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

const provinceFiles = ['540000', '610000', '620000', '630000', '640000', '650000'];
const expectedByProvince: Record<string, number> = {
  '54': 74,
  '61': 107,
  '62': 86,
  '63': 44,
  '64': 22,
  '65': 100,
};
const alreadyCoveredCountyCodes = new Set([
  '659001',
  '659002',
  '659003',
  '659004',
  '659005',
  '659006',
  '659007',
  '659008',
  '659009',
  '659010',
  '659011',
  '659012',
]);
const blankCodes = new Set(['653132', '653228', '653229', '659013']);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function canonicalName(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, '')
    .replace(
      /(人民政府门户网站|人民政府网站|人民政府网|政府门户网站|政府网站|人民政府办公室|人民政府|门户网站|管委会|管理委员会|行政公署|政府网|政府)$/,
      '',
    )
    .replace(/(自治县|自治州|县|市|区|特区|盟|旗)$/, '');
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
    join('tests', 'fixtures', 'county-west-remaining-portals.golden.json'),
  );
}

async function loadSources(): Promise<SourceFixture> {
  return readJson<SourceFixture>(
    join('tests', 'fixtures', 'county-west-remaining-portal-sources.json'),
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

describe('west remaining county portals', () => {
  it('locks all 433 targets and exact per-province counts', async () => {
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

    expect(expectedCodes).toHaveLength(433);
    expect(golden).toHaveLength(433);
    expect(new Set(golden.map((entry) => entry.regionCode))).toEqual(new Set(expectedCodes));
    expect(duplicateValues(golden.map((entry) => entry.regionCode))).toEqual([]);
    expect(
      golden
        .filter((entry) => !entry.expected)
        .map((entry) => entry.regionCode)
        .sort(),
    ).toEqual([...blankCodes].sort());
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
      expect(['city-directory', 'official-self', 'wikidata']).toContain(entry.sourceKind);
      if (entry.sourceKind === 'wikidata') {
        expect(entry.verificationUrl).toBe(entry.sourceUrl);
        expect(new URL(entry.p856Snapshot ?? '').hostname.replace(/^www\./, '')).toBe(
          new URL(entry.url ?? '').hostname.replace(/^www\./, ''),
        );
        expect(entry.p856CheckedAt).toBeTruthy();
      } else {
        expect(entry.anchorText).toBeTruthy();
        expect(canonicalName(entry.regionName).startsWith(canonicalName(entry.anchorText))).toBe(
          true,
        );
      }
    }
  });

  it('matches every expected record and leaves only documented targets blank', async () => {
    const golden = await loadGolden();
    const goldenByCode = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const records = await loadProvinceRecords();
    const targetRecords = records.filter((record) => goldenByCode.has(record.regionCode));
    expect(targetRecords).toHaveLength(429);
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
    for (const code of blankCodes)
      expect(records.filter((record) => record.regionCode === code)).toEqual([]);
  });

  it('locks source evidence and all source host mappings', async () => {
    const golden = await loadGolden();
    const fixture = await loadSources();
    const expected = golden.filter((entry) => entry.expected);
    const expectedByCode = new Map(expected.map((entry) => [entry.regionCode, entry]));
    const mappedCodes = new Set<string>();
    expect(new Set(fixture.sources.map((source) => source.sourceUrl))).toEqual(
      new Set(expected.map((entry) => entry.sourceUrl)),
    );
    for (const source of fixture.sources) {
      expect(source.sourceTitle).not.toBe('');
      expect(source.checkedAt).toBe(fixture.checkedAt);
      expect(source.verificationMethod).not.toBe('');
      expect(source.statusNote).not.toBe('');
      expect(source.httpStatus === null || Number.isInteger(source.httpStatus)).toBe(true);
      for (const mapping of source.targetMappings) {
        mappedCodes.add(mapping.regionCode);
        const entry = expectedByCode.get(mapping.regionCode);
        expect(entry).toBeDefined();
        expect(mapping.regionName).toBe(entry?.regionName);
        expect(mapping.targetUrl).toBe(entry?.url);
        expect(new URL(mapping.targetUrl).hostname).toBe(mapping.targetHost);
        expect(mapping.sourceKind).toBe(entry?.sourceKind);
        expect(
          mapping.targetHttpStatus === null || Number.isInteger(mapping.targetHttpStatus),
        ).toBe(true);
        expect(mapping.targetStatusNote).not.toBe('');
        expect(mapping.targetStatusNote).not.toMatch(/后台|登录|管理系统|管理平台|admin|login/i);
        if (mapping.sourceKind === 'wikidata') {
          expect(mapping.wikidataItem).toBe(entry?.wikidataItem);
          expect(mapping.verificationUrl).toBe(entry?.verificationUrl);
          expect(new URL(mapping.p856Snapshot ?? '').hostname.replace(/^www\./, '')).toBe(
            new URL(entry?.p856Snapshot ?? '').hostname.replace(/^www\./, ''),
          );
          expect(mapping.p856CheckedAt).toBe(entry?.p856CheckedAt);
        } else {
          expect(mapping.anchorText).toBeTruthy();
          expect(
            canonicalName(entry?.regionName ?? '').startsWith(canonicalName(mapping.anchorText)),
          ).toBe(true);
          expect(mapping.p856Snapshot).toBeUndefined();
        }
      }
    }
    expect(mappedCodes).toEqual(new Set(expected.map((entry) => entry.regionCode)));
    expect(duplicateValues(expected.map((entry) => entry.id ?? ''))).toEqual([]);
    expect(duplicateValues(expected.map((entry) => entry.url ?? ''))).toEqual([]);
    expect(duplicateValues(expected.map((entry) => new URL(entry.url ?? '').hostname))).toEqual([]);
  });

  it('locks corrected, blank, and shared-platform county mappings', async () => {
    const golden = await loadGolden();
    const records = await loadProvinceRecords();
    const expected = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const actual = new Map(records.map((record) => [record.regionCode, record]));

    for (const code of blankCodes)
      expect(expected.get(code)).toMatchObject({
        expected: false,
        blankReason: expect.any(String),
      });
    expect(expected.get('659013')?.blankReason).toMatch(/草湖市.*独立政府门户/);

    const fixed = new Map([
      ['620105', 'https://www.lzanning.gov.cn/'],
      ['640402', 'https://www.yzh.gov.cn/'],
      ['640422', 'https://www.nxxj.gov.cn/'],
      ['640423', 'https://www.nxld.gov.cn/'],
      ['640424', 'https://www.nxjy.gov.cn/'],
      ['640425', 'https://www.pengyang.gov.cn/'],
      ['652301', 'https://www.cjs.gov.cn/'],
      ['632701', 'https://www.yushushi.gov.cn/'],
      ['630103', 'http://www.xncz.gov.cn/'],
      ['632626', 'http://www.maduo.gov.cn/'],
      ['652827', 'http://www.xjhj.gov.cn/'],
      ['653123', 'http://www.yjs.gov.cn/'],
      ['653124', 'http://www.xjzp.gov.cn/'],
      ['653125', 'http://www.shache.gov.cn/'],
      ['653131', 'http://www.tskeg.gov.cn/'],
      ['653223', 'http://www.ps.gov.cn/'],
      ['653224', 'https://www.xjlpx.gov.cn/'],
      ['652901', 'https://www.akss.gov.cn/'],
      ['654221', 'http://www.xjem.gov.cn/'],
      ['654224', 'http://www.xjtl.gov.cn/'],
      ['654323', 'http://www.xjfhx.gov.cn/'],
      ['654326', 'https://www.jmn.gov.cn/'],
      ['622901', 'https://www.lxs.gov.cn/'],
      ['622921', 'https://www.linxiaxian.gov.cn/'],
      ['622922', 'https://www.gskanglexian.gov.cn/'],
      ['622923', 'https://www.gsyongjing.gov.cn/'],
      ['622924', 'https://www.ghx.gov.cn/'],
      ['622925', 'https://www.hezheng.gov.cn/'],
    ]);
    const officialSelfCodes = [
      '610202',
      '610203',
      '610204',
      '610222',
      '640303',
      '640323',
      '620105',
      '610902',
      '610921',
      '610922',
      '610923',
      '610924',
      '610925',
      '610926',
      '610927',
      '610929',
      '610981',
    ];
    for (const code of officialSelfCodes) {
      expect(expected.get(code)).toMatchObject({
        expected: true,
        sourceKind: 'official-self',
        sourceUrl: expected.get(code)?.url,
      });
    }

    for (const [code, url] of fixed) {
      expect(expected.get(code)).toMatchObject({ expected: true, url });
      expect(actual.get(code)).toMatchObject({ url });
    }
    expect(expected.get('653223')?.url).not.toBe('http://www.psx.gov.cn/');
    expect(expected.get('653224')?.url).not.toBe('https://www.lp.gov.cn/');
    expect(expected.get('653125')?.url).not.toBe('http://gat.xinjiang.gov.cn/');
    expect(expected.get('652901')?.url).not.toBe('https://www.aks.gov.cn/');
  });

  it('keeps all province records globally unique by id, url, and host', async () => {
    const files = (await readdir(join('data', 'provinces'))).filter((file) =>
      file.endsWith('.json'),
    );
    const records: AgencyRecord[] = [];
    for (const file of files)
      records.push(...(await readJson<AgencyRecord[]>(join('data', 'provinces', file))));
    const national = await readJson<AgencyRecord[]>(join('data', 'national.json'));
    const all = [...national, ...records];
    expect(duplicateValues(all.map((record) => record.id))).toEqual([]);
    expect(duplicateValues(all.map((record) => record.url))).toEqual([]);
    expect(duplicateValues(all.map((record) => new URL(record.url).hostname))).toEqual([]);
  });
});

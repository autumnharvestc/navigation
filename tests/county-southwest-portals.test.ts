import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type SourceKind = 'official-directory' | 'official-self' | 'wikidata';

type GoldenEntry = {
  regionCode: string;
  regionName: string;
  level: Region['level'];
  parentCode: string | null;
  expected: boolean;
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

const provinceFiles = ['510000', '520000', '530000'];
const expectedByProvince: Record<string, number> = {
  '51': 183,
  '52': 88,
  '53': 129,
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function canonicalName(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, '')
    .replace(
      /(人民政府门户网站|人民政府网站|人民政府网|政府门户网站|政府网站|人民政府办公室|人民政府|门户网站|管委会|管理委员会|行政公署)$/,
      '',
    )
    .replace(/(自治县|自治州|县|市|区|特区|盟)$/, '');
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
  return readJson<GoldenEntry[]>(join('tests', 'fixtures', 'county-southwest-portals.golden.json'));
}

async function loadSources(): Promise<SourceFixture> {
  return readJson<SourceFixture>(join('tests', 'fixtures', 'county-southwest-portal-sources.json'));
}

async function loadProvinceRecords(): Promise<AgencyRecord[]> {
  const records = await Promise.all(
    provinceFiles.map((file) =>
      readJson<AgencyRecord[]>(join('data', 'provinces', `${file}.json`)),
    ),
  );
  return records.flat();
}

describe('southwest county portals', () => {
  it('locks all 400 targets and exact per-province counts', async () => {
    const golden = await loadGolden();
    const regions = await readJson<Region[]>(join('data', 'regions.json'));
    const regionByCode = new Map(regions.map((region) => [region.code, region]));
    const expectedCodes = regions
      .filter(
        (region) =>
          region.level === 'county' && provinceFiles.includes(`${region.code.slice(0, 2)}0000`),
      )
      .map((region) => region.code);

    expect(expectedCodes).toHaveLength(400);
    expect(golden).toHaveLength(400);
    expect(new Set(golden.map((entry) => entry.regionCode))).toEqual(new Set(expectedCodes));
    expect(duplicateValues(golden.map((entry) => entry.regionCode))).toEqual([]);
    expect(golden.filter((entry) => !entry.expected)).toEqual([]);

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
        expected: true,
      });
      expect(entry.agencyName).toBe(`${region?.name}人民政府`);
      expect(entry.siteName).toBe(entry.agencyName);
      expect(entry.id).toBeTruthy();
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(entry.sourceKind).toMatch(/^(wikidata|official-directory|official-self)$/);
    }

    const records = await loadProvinceRecords();
    const actual = new Map(records.map((record) => [record.regionCode, record]));
    for (const entry of golden) {
      expect(actual.get(entry.regionCode)).toMatchObject({
        id: entry.id,
        regionCode: entry.regionCode,
        name: entry.agencyName,
        siteName: entry.siteName,
        url: entry.url,
        category: 'government',
        sourceUrl: entry.sourceUrl,
      });
    }
  });

  it('locks source evidence and all source host mappings', async () => {
    const golden = await loadGolden();
    const fixture = await loadSources();
    const expectedByCode = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const mappedCodes = new Set<string>();

    expect(fixture.checkedAt).toBeTruthy();
    expect(fixture.maintenance).toContain('P856');
    expect(new Set(fixture.sources.map((source) => source.sourceUrl))).toEqual(
      new Set(golden.map((entry) => entry.sourceUrl)),
    );

    for (const source of fixture.sources) {
      expect(source.sourceTitle).not.toBe('');
      expect(source.checkedAt).toBe(fixture.checkedAt);
      expect(source.verificationMethod).not.toBe('');
      expect(source.statusNote).not.toBe('');
      expect(source.httpStatus === null || Number.isInteger(source.httpStatus)).toBe(true);
      if (source.httpStatus === null) expect(source.statusNote).toBeTruthy();
      expect(['official-directory', 'official-self', 'wikidata']).toContain(source.sourceKind);

      for (const mapping of source.targetMappings) {
        mappedCodes.add(mapping.regionCode);
        const entry = expectedByCode.get(mapping.regionCode);
        expect(entry).toBeDefined();
        expect(mapping.sourceKind).toBe(entry?.sourceKind);
        expect(mapping.regionName).toBe(entry?.regionName);
        expect(mapping.targetUrl).toBe(entry?.url);
        expect(new URL(mapping.targetUrl).hostname).toBe(mapping.targetHost);
        expect(
          mapping.targetHttpStatus === null || Number.isInteger(mapping.targetHttpStatus),
        ).toBe(true);
        expect(mapping.targetStatusNote).not.toBe('');
        expect(mapping.targetStatusNote).not.toMatch(/后台|登录|管理系统|管理平台|admin|login/i);

        if (mapping.sourceKind === 'wikidata') {
          expect(mapping.wikidataItem).toBe(entry?.wikidataItem);
          expect(mapping.verificationUrl).toBe(entry?.verificationUrl);
          expect(mapping.p856Snapshot).toBe(entry?.p856Snapshot);
          expect(mapping.p856CheckedAt).toBe(entry?.p856CheckedAt);
        } else {
          expect(mapping.anchorText).toBeTruthy();
          expect(canonicalName(mapping.anchorText)).toBe(canonicalName(entry?.regionName));
          expect(canonicalName(mapping.anchorText)).not.toMatch(
            /走进|活动|公告|座谈|会议|新闻|调研|项目|工作|报道|科技|小院|专题|要闻|动态/,
          );
          expect(mapping.p856Snapshot).toBeUndefined();
        }
      }
    }

    expect(mappedCodes).toEqual(new Set(golden.map((entry) => entry.regionCode)));
    expect(duplicateValues(golden.map((entry) => entry.id ?? ''))).toEqual([]);
    expect(duplicateValues(golden.map((entry) => entry.url ?? ''))).toEqual([]);
    expect(duplicateValues(golden.map((entry) => new URL(entry.url ?? '').hostname))).toEqual([]);
  });

  it('locks corrected and official-directory portals', async () => {
    const golden = await loadGolden();
    const records = await loadProvinceRecords();
    const expected = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const actual = new Map(records.map((record) => [record.regionCode, record]));

    const official = new Map([
      ['510116', ['https://www.shuangliu.gov.cn/', 'official-self']],
      ['510411', ['http://www.screnhe.gov.cn/', 'official-directory']],
      ['510705', ['https://www.anzhou.gov.cn/', 'official-directory']],
      ['510722', ['https://www.santai.gov.cn/', 'official-directory']],
      ['510723', ['https://www.yanting.gov.cn/', 'official-directory']],
      ['510726', ['https://www.beichuan.gov.cn/', 'official-directory']],
      ['511504', ['https://www.ybxz.gov.cn/', 'official-directory']],
      ['513324', ['https://www.scjl.gov.cn/', 'official-directory']],
      ['513326', ['https://www.gzdf.gov.cn/', 'official-directory']],
      ['513333', ['https://www.gzzsdxrmzf.gov.cn/', 'official-directory']],
      ['513423', ['https://www.yanyuan.gov.cn/', 'official-directory']],
      ['513429', ['https://www.bt.gov.cn/', 'official-directory']],
      ['520102', ['https://www.nanming.gov.cn/', 'official-self']],
      ['520111', ['https://www.huaxi.gov.cn/', 'official-directory']],
      ['520121', ['https://www.kaiyang.gov.cn/', 'official-directory']],
      ['520281', ['https://www.panzhou.gov.cn/', 'official-directory']],
      ['520329', ['https://www.zgyq.gov.cn/', 'official-directory']],
      ['520330', ['https://www.xsx.gov.cn/', 'official-directory']],
      ['520602', ['https://www.bjq.gov.cn/', 'official-directory']],
      ['520603', ['https://www.trws.gov.cn/', 'official-directory']],
      ['522631', ['https://www.lp.gov.cn/', 'official-directory']],
      ['522701', ['https://www.duyun.gov.cn/', 'official-directory']],
      ['522732', ['https://www.sandu.gov.cn/', 'official-directory']],
      ['530302', ['https://www.ql.gov.cn/', 'official-directory']],
      ['530381', ['https://www.xw.gov.cn/', 'official-directory']],
    ]);

    for (const [code, [url, sourceKind]] of official) {
      expect(expected.get(code)).toMatchObject({ expected: true, url, sourceKind });
      expect(actual.get(code)).toMatchObject({ url });
    }

    expect(expected.get('510116')?.url).not.toBe('http://www.cdjinjiang.gov.cn/');
    expect(expected.get('520330')?.url).not.toBe('http://www.xishui.gov.cn/');
    expect(expected.get('510682')).toMatchObject({ url: 'https://www.shifang.gov.cn/' });
    expect(actual.get('510682')?.url).toBe('https://www.shifang.gov.cn/');
  });

  it('keeps all province records globally unique by id, url, and host', async () => {
    const files = (await readdir(join('data', 'provinces'))).filter((file) =>
      file.endsWith('.json'),
    );
    const records: AgencyRecord[] = [];
    for (const file of files) {
      records.push(...(await readJson<AgencyRecord[]>(join('data', 'provinces', file))));
    }
    const national = await readJson<AgencyRecord[]>(join('data', 'national.json'));
    const all = [...national, ...records];
    expect(duplicateValues(all.map((record) => record.id))).toEqual([]);
    expect(duplicateValues(all.map((record) => record.url))).toEqual([]);
    expect(duplicateValues(all.map((record) => new URL(record.url).hostname))).toEqual([]);
  });
});

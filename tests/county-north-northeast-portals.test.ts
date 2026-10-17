import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type SourceKind = 'city-directory' | 'official-directory' | 'wikidata';

type GoldenEntry = {
  regionCode: string;
  regionName: string;
  level: Region['level'];
  parentCode: string | null;
  expected: boolean;
  id: string;
  agencyName: string;
  siteName: string;
  url: string;
  sourceUrl: string;
  sourceKind: SourceKind;
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

const provinceFiles = ['130000', '140000', '210000', '220000'];
const expectedByProvince: Record<string, number> = { '13': 167, '14': 117, '21': 100, '22': 60 };

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
    join('tests', 'fixtures', 'county-north-northeast-portals.golden.json'),
  );
}

async function loadSources(): Promise<SourceFixture> {
  return readJson<SourceFixture>(
    join('tests', 'fixtures', 'county-north-northeast-portal-sources.json'),
  );
}

describe('north and northeast county portals', () => {
  it('locks all 444 targets and exact per-province counts', async () => {
    const golden = await loadGolden();
    const regions = await readJson<Region[]>(join('data', 'regions.json'));
    const regionByCode = new Map(regions.map((region) => [region.code, region]));

    expect(golden).toHaveLength(444);
    expect(duplicateValues(golden.map((entry) => entry.regionCode))).toEqual([]);
    const expectedCodes = new Set(
      regions
        .filter(
          (region) =>
            region.level === 'county' &&
            ['130000', '140000', '210000', '220000'].includes(`${region.code.slice(0, 2)}0000`),
        )
        .map((region) => region.code),
    );
    expect(new Set(golden.map((entry) => entry.regionCode))).toEqual(expectedCodes);
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
        agencyName: `${region?.name}人民政府`,
      });
      expect(entry.id).toBeTruthy();
      expect(entry.siteName).toBeTruthy();
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(['city-directory', 'official-directory', 'wikidata']).toContain(entry.sourceKind);
      if (entry.sourceKind === 'wikidata') {
        expect(entry.verificationUrl).toBe(entry.sourceUrl);
        expect(entry.p856Snapshot).toBe(entry.url);
        expect(entry.p856CheckedAt).toBeTruthy();
      } else {
        expect(entry.anchorText).toBeTruthy();
        expect(canonicalName(entry.anchorText).endsWith(canonicalName(entry.regionName))).toBe(
          true,
        );
        expect(canonicalName(entry.anchorText)).not.toMatch(/新闻|调研|项目|工作|报道|科技|小院/);
      }
    }
  });

  it('matches every golden record and does not add extra county records', async () => {
    const golden = await loadGolden();
    const goldenByCode = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const records = (
      await Promise.all(
        provinceFiles.map((file) =>
          readJson<AgencyRecord[]>(join('data', 'provinces', `${file}.json`)),
        ),
      )
    ).flat();
    const targetRecords = records.filter((record) => goldenByCode.has(record.regionCode));
    expect(targetRecords).toHaveLength(444);

    for (const actual of targetRecords) {
      const expected = goldenByCode.get(actual.regionCode);
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
  });

  it('locks source evidence and source host mappings', async () => {
    const golden = await loadGolden();
    const fixture = await loadSources();
    const expectedByCode = new Map(golden.map((entry) => [entry.regionCode, entry]));
    const mappedCodes = new Set<string>();

    expect(fixture.checkedAt).toBeTruthy();
    expect(fixture.maintenance).toContain('固定候选来源');
    expect(new Set(fixture.sources.map((source) => source.sourceUrl))).toEqual(
      new Set(golden.map((entry) => entry.sourceUrl)),
    );

    for (const source of fixture.sources) {
      expect(source.sourceTitle).not.toBe('');
      expect(source.checkedAt).toBe(fixture.checkedAt);
      expect(source.verificationMethod).not.toBe('');
      expect(source.statusNote).not.toBe('');
      expect(source.httpStatus === null || Number.isInteger(source.httpStatus)).toBe(true);
      expect(['city-directory', 'official-directory', 'wikidata']).toContain(source.sourceKind);
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
          expect(mapping.p856Snapshot).toBe(entry?.p856Snapshot);
          expect(mapping.p856CheckedAt).toBe(entry?.p856CheckedAt);
        } else {
          expect(mapping.anchorText).toBeTruthy();
          expect(canonicalName(mapping.anchorText).endsWith(canonicalName(entry?.regionName))).toBe(
            true,
          );
          expect(canonicalName(mapping.anchorText)).not.toMatch(
            /新闻|调研|项目|工作|报道|科技|小院/,
          );
          expect(mapping.p856Snapshot).toBeUndefined();
        }
      }
    }

    expect(mappedCodes).toEqual(new Set(golden.map((entry) => entry.regionCode)));
    expect(duplicateValues(golden.map((entry) => new URL(entry.url).hostname))).toEqual([]);
  });

  it('locks known corrected official county portals', async () => {
    const golden = await loadGolden();
    const records = (
      await Promise.all(
        provinceFiles.map((file) =>
          readJson<AgencyRecord[]>(join('data', 'provinces', `${file}.json`)),
        ),
      )
    ).flat();
    const actual = new Map(records.map((record) => [record.regionCode, record]));
    const expected = new Map(golden.map((entry) => [entry.regionCode, entry]));

    for (const code of ['130304', '130324', '130435', '210124', '220183']) {
      expect(actual.get(code)).toMatchObject({
        id: expected.get(code)?.id,
        url: expected.get(code)?.url,
        sourceUrl: expected.get(code)?.sourceUrl,
      });
    }
    expect(expected.get('130435')?.url).toBe('http://www.qzx.gov.cn/');
    expect(expected.get('210124')).toMatchObject({
      url: 'https://www.faku.gov.cn/',
      sourceKind: 'official-directory',
      sourceUrl: 'https://www.ln.gov.cn/',
    });
    expect(expected.get('130304')?.url).toBe('http://www.beidaihe.gov.cn/');
    expect(expected.get('220183')).toMatchObject({
      url: 'http://www.dehui.gov.cn/',
      sourceKind: 'official-directory',
      sourceUrl: 'http://www.changchun.gov.cn/',
    });
    expect(expected.get('130324')?.url).toBe('https://www.lulong.gov.cn/');
  });

  it('keeps all published IDs and URLs globally unique', async () => {
    const files = (await readdir(join('data', 'provinces')))
      .filter((file) => file.endsWith('.json'))
      .sort();
    const records = [
      ...(await readJson<AgencyRecord[]>(join('data', 'national.json'))),
      ...(
        await Promise.all(
          files.map((file) => readJson<AgencyRecord[]>(join('data', 'provinces', file))),
        )
      ).flat(),
    ];

    expect(duplicateValues(records.map((record) => record.id))).toEqual([]);
    expect(
      duplicateValues(records.map((record) => record.url.replace(/\/$/, '').toLowerCase())),
    ).toEqual([]);
  });
});

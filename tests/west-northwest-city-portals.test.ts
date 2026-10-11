import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type GoldenPortal = {
  id: string;
  regionCode: string;
  regionName: string;
  level: Region['level'];
  parentCode: string | null;
  agencyName: string;
  siteName: string;
  url: string;
  sourceUrl: string;
};

type TargetMapping = {
  regionCode: string;
  url: string;
  host: string;
  httpStatus: number;
  finalUrl: string;
};

type SourceEvidence = {
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
  checkedAt: string;
  httpStatus: number;
  finalUrl: string;
  directHttpStatus?: number;
  verificationMethod?: string;
  targetHosts: string[];
  targetMappings: TargetMapping[];
  intermediateEvidence?: Array<{ url: string; note: string }>;
};

type VerificationAnomaly = {
  regionCode: string;
  kind: string;
  detail: string;
};

type SourceEvidenceFixture = {
  checkedAt: string;
  maintenance: string;
  sources: SourceEvidence[];
  anomalies: VerificationAnomaly[];
};

const provinceFiles = [
  '500000',
  '510000',
  '520000',
  '530000',
  '540000',
  '610000',
  '620000',
  '630000',
  '640000',
  '650000',
];
const expectedCounts: Record<string, number> = {
  '500000': 37,
  '510000': 21,
  '520000': 9,
  '530000': 16,
  '540000': 7,
  '610000': 10,
  '620000': 14,
  '630000': 8,
  '640000': 5,
  '650000': 27,
};
const expectedSourceUrls = [
  'https://www.cq.gov.cn/',
  'https://www.sc.gov.cn/',
  'https://www.guizhou.gov.cn/',
  'https://www.yn.gov.cn/',
  'https://www.xizang.gov.cn/',
  'https://www.shaanxi.gov.cn/',
  'https://www.gansu.gov.cn/',
  'http://www.qinghai.gov.cn/',
  'https://www.nx.gov.cn/',
  'https://www.xinjiang.gov.cn/',
];
const expectedAnomalyCodes = [
  '510100',
  '510800',
  '530800',
  '530900',
  '532900',
  '540100',
  '620100',
  '632300',
  '632600',
];

async function readData<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), 'data', path), 'utf8')) as T;
}

async function readFixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), 'tests', 'fixtures', name), 'utf8')) as T;
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}${url.search}`;
}

function expectedAgencyName(entry: GoldenPortal): string {
  if (entry.regionName === '地区' || entry.regionName.endsWith('地区')) {
    return `${entry.regionName}行政公署`;
  }
  if (entry.regionCode.startsWith('50')) {
    return `重庆市${entry.regionName}人民政府`;
  }
  return `${entry.regionName}人民政府`;
}

describe('west and northwest city portals', () => {
  it('matches the fixed 154-entry golden snapshot exactly', async () => {
    const golden = await readFixture<GoldenPortal[]>('west-northwest-portals.golden.json');
    const regions = await readData<Region[]>('regions.json');

    expect(golden, 'golden snapshot must contain the 154 verified portals').toHaveLength(154);
    expect(duplicateValues(golden.map((entry) => entry.regionCode))).toEqual([]);
    for (const [province, count] of Object.entries(expectedCounts)) {
      expect(
        golden.filter((entry) => entry.regionCode.startsWith(province.slice(0, 2))),
        `${province} portal count changed`,
      ).toHaveLength(count);
    }

    const goldenCodes = new Set(golden.map((entry) => entry.regionCode));
    const provinceAgencies = await Promise.all(
      provinceFiles.map((province) => readData<AgencyRecord[]>(`provinces/${province}.json`)),
    );
    const allRecords = provinceAgencies.flat();
    const targetRecords = allRecords.filter((record) => goldenCodes.has(record.regionCode));
    const actualByRegion = new Map<string, AgencyRecord[]>();

    for (const record of targetRecords) {
      const records = actualByRegion.get(record.regionCode) ?? [];
      records.push(record);
      actualByRegion.set(record.regionCode, records);
    }

    expect(
      [...actualByRegion.keys()].sort(),
      'published target regions must match the golden region set exactly',
    ).toEqual([...goldenCodes].sort());
    expect(
      allRecords.filter((record) => provinceFiles.includes(record.regionCode)),
      'each province must retain exactly one province record',
    ).toHaveLength(10);
    expect(
      allRecords.filter(
        (record) => record.regionCode === '500100' || record.regionCode === '659000',
      ),
      'synthetic navigation groups must not be published as agencies',
    ).toHaveLength(0);

    for (const expected of golden) {
      const actual = actualByRegion.get(expected.regionCode) ?? [];
      expect(actual, `${expected.regionCode} must have exactly one published record`).toHaveLength(
        1,
      );
      expect(actual[0]).toEqual({
        id: expected.id,
        regionCode: expected.regionCode,
        name: expected.agencyName,
        siteName: expected.siteName,
        url: expected.url,
        category: 'government',
        sourceUrl: expected.sourceUrl,
      });
      expect(normalizedUrl(actual[0]?.url ?? ''), `${expected.regionCode} URL changed`).toBe(
        normalizedUrl(expected.url),
      );
      expect(
        normalizedUrl(actual[0]?.sourceUrl ?? ''),
        `${expected.regionCode} sourceUrl changed`,
      ).toBe(normalizedUrl(expected.sourceUrl));

      const region = regions.find((candidate) => candidate.code === expected.regionCode);
      expect(region, `missing region ${expected.regionCode}`).toMatchObject({
        name: expected.regionName,
        level: expected.level,
        parentCode: expected.parentCode,
      });
      expect(expected.agencyName).toBe(expectedAgencyName(expected));
    }
  });

  it('locks each source page to its exact regionCode, URL and host mapping', async () => {
    const golden = await readFixture<GoldenPortal[]>('west-northwest-portals.golden.json');
    const fixture = await readFixture<SourceEvidenceFixture>('west-northwest-portal-sources.json');
    const goldenCodes = new Set(golden.map((entry) => entry.regionCode));

    expect(fixture.sources).toHaveLength(10);
    expect(uniqueSorted(fixture.sources.map((source) => source.sourceUrl))).toEqual(
      [...expectedSourceUrls].sort(),
    );
    expect(duplicateValues(fixture.sources.map((source) => source.sourceUrl))).toEqual([]);

    const sourceByUrl = new Map(fixture.sources.map((source) => [source.sourceUrl, source]));
    for (const source of fixture.sources) {
      expect(source.sourceTitle).not.toBe('');
      expect(source.evidence).not.toBe('');
      expect(source.checkedAt).toBe(fixture.checkedAt);
      expect(source.targetHosts).toHaveLength(new Set(source.targetHosts).size);
      expect(source.targetMappings).toHaveLength(
        new Set(source.targetMappings.map((entry) => entry.regionCode)).size,
      );
      expect(sourceByUrl.get(source.sourceUrl)).toBe(source);

      const expectedMappings = golden
        .filter((entry) => entry.sourceUrl === source.sourceUrl)
        .map((entry) => ({
          regionCode: entry.regionCode,
          url: entry.url,
          host: new URL(entry.url).hostname,
        }))
        .sort((a, b) => a.regionCode.localeCompare(b.regionCode));
      expect(
        source.targetMappings.map(({ regionCode, url, host }) => ({ regionCode, url, host })),
      ).toEqual(expectedMappings);
      expect(source.targetHosts).toEqual(
        [...new Set(expectedMappings.map((entry) => entry.host))].sort(),
      );
      for (const mapping of source.targetMappings) {
        expect(Number.isInteger(mapping.httpStatus)).toBe(true);
        expect(() => new URL(mapping.finalUrl)).not.toThrow();
      }
    }

    for (const entry of golden) {
      const source = sourceByUrl.get(entry.sourceUrl);
      expect(source, `no source evidence for ${entry.sourceUrl}`).toBeDefined();
      expect(source?.targetHosts, `${entry.regionCode} host must match source evidence`).toContain(
        new URL(entry.url).hostname,
      );
    }

    expect(duplicateValues(fixture.anomalies.map((entry) => entry.regionCode))).toEqual([]);
    expect(uniqueSorted(fixture.anomalies.map((entry) => entry.regionCode))).toEqual(
      [...expectedAnomalyCodes].sort(),
    );
    for (const anomaly of fixture.anomalies) {
      expect(goldenCodes.has(anomaly.regionCode)).toBe(true);
      expect(anomaly.kind).not.toBe('');
      expect(anomaly.detail).not.toBe('');
    }

    const xinjiang = fixture.sources.find(
      (source) => source.sourceUrl === 'https://www.xinjiang.gov.cn/',
    );
    expect(xinjiang?.intermediateEvidence).toHaveLength(1);
    expect(xinjiang?.intermediateEvidence?.[0]?.url).toBe(
      'https://www.xjbtnss.gov.cn/xwzx/ssyw/202610/t20261009_68473.html',
    );
  });

  it('keeps IDs and URLs globally unique across all published data', async () => {
    const files = (await readdir(join(process.cwd(), 'data', 'provinces')))
      .filter((file) => file.endsWith('.json'))
      .sort();
    const records = [
      ...(await readData<AgencyRecord[]>('national.json')),
      ...(
        await Promise.all(files.map((file) => readData<AgencyRecord[]>(`provinces/${file}`)))
      ).flat(),
    ];

    expect(duplicateValues(records.map((record) => record.id))).toEqual([]);
    expect(
      duplicateValues(records.map((record) => record.url.replace(/\/$/, '').toLowerCase())),
    ).toEqual([]);
  });
});

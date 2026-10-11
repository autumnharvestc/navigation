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

type SourceEvidence = {
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
  checkedAt: string;
  httpStatus: number;
  finalUrl: string;
  targetHosts: string[];
  targetMappings?: Array<{ regionCode: string; url: string; host: string }>;
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

const provinceFiles = ['410000', '420000', '430000', '440000', '450000', '460000'];
const expectedCounts: Record<string, number> = {
  '410000': 18,
  '420000': 17,
  '430000': 14,
  '440000': 21,
  '450000': 14,
  '460000': 19,
};
const expectedSourceUrls = [
  'https://www.henan.gov.cn/',
  'https://www.wuhan.gov.cn/zwgk/',
  'https://www.hunan.gov.cn/hnszf/fzlm/wzdh/szxq/sxdh.html',
  'http://www.gd.gov.cn/yw/ds/index.html',
  'http://www.gxzf.gov.cn/',
  'https://www.hainan.gov.cn/hainan/',
];
const expectedAnomalyCodes = [
  '411000',
  '411400',
  '430400',
  '431000',
  '431200',
  '433100',
  '440200',
  '441400',
  '441800',
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

function hostSlug(value: string): string {
  return new URL(value).hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('central and south china city portals', () => {
  it('matches the fixed 103-entry golden snapshot exactly', async () => {
    const golden = await readFixture<GoldenPortal[]>('central-south-portals.golden.json');
    const regions = await readData<Region[]>('regions.json');

    expect(golden, 'golden snapshot must contain the 103 verified portals').toHaveLength(103);
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
    ).toHaveLength(6);

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
      expect(expected.agencyName).toBe(`${expected.regionName}人民政府`);
    }
  });

  it('locks the six source pages to exact host and anomaly evidence', async () => {
    const golden = await readFixture<GoldenPortal[]>('central-south-portals.golden.json');
    const fixture = await readFixture<SourceEvidenceFixture>('central-south-portal-sources.json');
    const goldenCodes = new Set(golden.map((entry) => entry.regionCode));

    expect(fixture.sources).toHaveLength(6);
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
      expect(sourceByUrl.get(source.sourceUrl)).toBe(source);
    }

    for (const entry of golden) {
      const source = sourceByUrl.get(entry.sourceUrl);
      expect(source, `no source evidence for ${entry.sourceUrl}`).toBeDefined();
      expect(source?.targetHosts, `${entry.regionCode} host must match source evidence`).toContain(
        new URL(entry.url).hostname,
      );
    }

    expect(
      fixture.sources.find((source) => source.sourceUrl.includes('henan.gov.cn'))
        ?.intermediateEvidence?.length,
    ).toBe(1);
    expect(JSON.stringify(fixture)).not.toContain('r.jina.ai');
    const hubeiSource = fixture.sources.find(
      (source) => source.sourceUrl === 'https://www.wuhan.gov.cn/zwgk/',
    );
    const hubeiGolden = golden.filter((entry) => entry.regionCode.startsWith('42'));
    expect(hubeiSource?.targetMappings).toEqual(
      hubeiGolden
        .map((entry) => ({
          regionCode: entry.regionCode,
          url: entry.url,
          host: new URL(entry.url).hostname,
        }))
        .sort((a, b) => a.regionCode.localeCompare(b.regionCode)),
    );
    expect(duplicateValues(fixture.anomalies.map((entry) => entry.regionCode))).toEqual([]);
    expect(uniqueSorted(fixture.anomalies.map((entry) => entry.regionCode))).toEqual(
      [...expectedAnomalyCodes].sort(),
    );
    for (const anomaly of fixture.anomalies) {
      expect(goldenCodes.has(anomaly.regionCode)).toBe(true);
      expect(anomaly.kind).not.toBe('');
      expect(anomaly.detail).not.toBe('');
    }
  });

  it('locks corrected Guangdong regionCode to URL mappings', async () => {
    const golden = await readFixture<GoldenPortal[]>('central-south-portals.golden.json');
    const records = await readData<AgencyRecord[]>('provinces/440000.json');
    const expected = {
      '440200': 'https://www.sg.gov.cn/',
      '440300': 'https://www.sz.gov.cn/',
      '440400': 'https://www.zhuhai.gov.cn/',
      '440500': 'https://www.shantou.gov.cn/',
      '440600': 'https://www.foshan.gov.cn/',
    } as const;

    for (const [regionCode, url] of Object.entries(expected)) {
      const goldenEntry = golden.find((entry) => entry.regionCode === regionCode);
      const record = records.find((candidate) => candidate.regionCode === regionCode);
      expect(goldenEntry?.url, `${regionCode} golden URL changed`).toBe(url);
      expect(normalizedUrl(record?.url ?? ''), `${regionCode} data URL changed`).toBe(
        normalizedUrl(url),
      );
      expect(record?.id).toBe(`${regionCode}-government-${hostSlug(url)}`);
    }
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

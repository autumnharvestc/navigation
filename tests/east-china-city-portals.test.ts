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

const provinceFiles = ['310000', '320000', '330000', '340000', '350000', '360000', '370000'];
const expectedCounts: Record<string, number> = {
  '310000': 16,
  '320000': 13,
  '330000': 11,
  '340000': 16,
  '350000': 9,
  '360000': 11,
  '370000': 16,
};
const expectedAnomalyCodes = [
  '310114',
  '310115',
  '340100',
  '341000',
  '360200',
  '360600',
  '370200',
  '370400',
  '370500',
  '371100',
  '371500',
  '371600',
  '371700',
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

describe('east china city portals', () => {
  it('matches the fixed 92-entry golden snapshot exactly', async () => {
    const golden = await readFixture<GoldenPortal[]>('east-china-portals.golden.json');
    const regions = await readData<Region[]>('regions.json');

    expect(golden, 'golden snapshot must contain the 92 verified portals').toHaveLength(92);
    expect(
      duplicateValues(golden.map((entry) => entry.regionCode)),
      'golden region codes must be unique',
    ).toEqual([]);
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
    const targetRecords = allRecords.filter((record) => !provinceFiles.includes(record.regionCode));
    const actualByRegion = new Map<string, AgencyRecord[]>();

    for (const record of targetRecords) {
      expect(goldenCodes.has(record.regionCode), `unexpected target record ${record.id}`).toBe(
        true,
      );
      const records = actualByRegion.get(record.regionCode) ?? [];
      records.push(record);
      actualByRegion.set(record.regionCode, records);
    }

    expect(
      [...actualByRegion.keys()].sort(),
      'published target regions must match the golden region set exactly',
    ).toEqual([...goldenCodes].sort());

    for (const [index, province] of provinceFiles.entries()) {
      const provinceRecords = (provinceAgencies[index] ?? []).filter(
        (record) => record.regionCode === province,
      );
      expect(
        provinceRecords,
        `${province} must retain exactly one existing province record`,
      ).toHaveLength(1);
    }

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

      const region = regions.find((candidate) => candidate.code === expected.regionCode);
      expect(region, `missing region ${expected.regionCode}`).toMatchObject({
        name: expected.regionName,
        level: expected.level,
        parentCode: expected.parentCode,
      });
    }
  });

  it('locks the seven verified source pages to exact host and anomaly evidence', async () => {
    const golden = await readFixture<GoldenPortal[]>('east-china-portals.golden.json');
    const fixture = await readFixture<SourceEvidenceFixture>('east-china-portal-sources.json');
    const sourceByUrl = new Map(fixture.sources.map((source) => [source.sourceUrl, source]));

    expect(fixture.checkedAt).toBe('2026-10-11T10:32:16+08:00');
    expect(fixture.maintenance).toContain('人工联网核验后的静态证据快照');
    expect(fixture.sources).toHaveLength(7);
    expect(
      duplicateValues(fixture.sources.map((source) => source.sourceUrl)),
      'source URLs must be unique',
    ).toEqual([]);
    expect(
      [...sourceByUrl.keys()].sort(),
      'source fixture must cover exactly the golden source URLs',
    ).toEqual(uniqueSorted(golden.map((entry) => entry.sourceUrl)));

    for (const source of fixture.sources) {
      expect(source.sourceTitle, `${source.sourceUrl} must record the verified title`).not.toBe('');
      expect(source.evidence, `${source.sourceUrl} must record verification evidence`).not.toBe('');
      expect(source.checkedAt, `${source.sourceUrl} must record its verification time`).toBe(
        fixture.checkedAt,
      );
      expect(source.httpStatus, `${source.sourceUrl} must be a successful source page`).toBe(200);
      expect(source.finalUrl, `${source.sourceUrl} must record the final URL`).not.toBe('');
      expect(
        duplicateValues(source.targetHosts),
        `${source.sourceUrl} target hosts must be unique`,
      ).toEqual([]);

      const expectedHosts = uniqueSorted(
        golden
          .filter((entry) => entry.sourceUrl === source.sourceUrl)
          .map((entry) => new URL(entry.url).hostname),
      );
      expect(source.targetHosts, `${source.sourceUrl} target hosts changed`).toEqual(expectedHosts);
    }

    for (const entry of golden) {
      const source = sourceByUrl.get(entry.sourceUrl);
      expect(source, `no source evidence for ${entry.sourceUrl}`).toBeDefined();
      expect(source?.targetHosts, `${entry.regionCode} host must match source evidence`).toContain(
        new URL(entry.url).hostname,
      );
    }

    expect(
      duplicateValues(fixture.anomalies.map((entry) => entry.regionCode)),
      'anomaly region codes must be unique',
    ).toEqual([]);
    expect(uniqueSorted(fixture.anomalies.map((entry) => entry.regionCode))).toEqual(
      expectedAnomalyCodes,
    );
    for (const anomaly of fixture.anomalies) {
      expect(anomaly.kind, `${anomaly.regionCode} must record an anomaly kind`).not.toBe('');
      expect(anomaly.detail, `${anomaly.regionCode} must record anomaly detail`).not.toBe('');
      expect(goldenCodesForTest(golden).has(anomaly.regionCode)).toBe(true);
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

    expect(duplicateValues(records.map((record) => record.id)), 'duplicate IDs').toEqual([]);
    expect(
      duplicateValues(records.map((record) => record.url.replace(/\/$/, '').toLowerCase())),
      'duplicate URLs',
    ).toEqual([]);
  });
});

function goldenCodesForTest(golden: GoldenPortal[]): Set<string> {
  return new Set(golden.map((entry) => entry.regionCode));
}

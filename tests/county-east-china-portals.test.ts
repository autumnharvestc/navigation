import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type GoldenEntry = {
  regionCode: string;
  regionName: string;
  level: Region['level'];
  parentCode: string | null;
  expected: boolean;
  reason?: string;
  id?: string;
  agencyName?: string;
  siteName?: string;
  url?: string;
  sourceUrl?: string;
  sourceKind?: 'city-anchor' | 'desktop-search' | 'mobile-search';
};

type TargetMapping = {
  regionCode: string;
  regionName: string;
  targetUrl: string;
  targetHost: string;
  sourceKind: string;
  verifiedTitle: string;
};

type SourceEvidence = {
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
  checkedAt: string;
  httpStatus: number;
  finalUrl: string;
  targetHosts: string[];
  targetMappings: TargetMapping[];
};

type SourceFixture = {
  checkedAt: string;
  maintenance: string;
  sources: SourceEvidence[];
  anomalies: Array<{ regionCode: string; kind: string; detail: string }>;
};

const provinceFiles = ['320000', '330000', '340000', '350000', '360000', '370000'];
const expectedByProvince: Record<string, { total: number; included: number; blank: number }> = {
  '32': { total: 95, included: 95, blank: 0 },
  '33': { total: 90, included: 90, blank: 0 },
  '34': { total: 104, included: 104, blank: 0 },
  '35': { total: 84, included: 83, blank: 1 },
  '36': { total: 100, included: 100, blank: 0 },
  '37': { total: 136, included: 136, blank: 0 },
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function loadGolden(): Promise<GoldenEntry[]> {
  return readJson<GoldenEntry[]>(
    join('tests', 'fixtures', 'county-east-china-portals.golden.json'),
  );
}

async function loadSources(): Promise<SourceFixture> {
  return readJson<SourceFixture>(
    join('tests', 'fixtures', 'county-east-china-portal-sources.json'),
  );
}

async function loadProvinceRecords(): Promise<AgencyRecord[]> {
  const files = await Promise.all(
    provinceFiles.map((file) =>
      readJson<AgencyRecord[]>(join('data', 'provinces', `${file}.json`)),
    ),
  );
  return files.flat();
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

describe('east china county portals', () => {
  it('keeps the frozen 609 target golden and exact expected/empty status', async () => {
    const golden = await loadGolden();
    const regions = await readJson<Region[]>(join('data', 'regions.json'));
    const regionByCode = new Map(regions.map((region) => [region.code, region]));

    expect(golden).toHaveLength(609);
    expect(duplicateValues(golden.map((entry) => entry.regionCode))).toEqual([]);

    for (const [prefix, expected] of Object.entries(expectedByProvince)) {
      const entries = golden.filter((entry) => entry.regionCode.startsWith(prefix));
      expect(entries).toHaveLength(expected.total);
      expect(entries.filter((entry) => entry.expected)).toHaveLength(expected.included);
      expect(entries.filter((entry) => !entry.expected)).toHaveLength(expected.blank);
    }

    for (const entry of golden) {
      const region = regionByCode.get(entry.regionCode);
      expect(region).toBeDefined();
      expect(region).toMatchObject({
        name: entry.regionName,
        level: entry.level,
        parentCode: entry.parentCode,
      });
      if (!entry.expected) {
        expect(entry.reason).toBeTruthy();
        expect(entry.url).toBeUndefined();
        continue;
      }
      expect(entry.id).toBeTruthy();
      expect(entry.agencyName).toBe(`${entry.regionName}人民政府`);
      expect(entry.siteName).toBeTruthy();
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(['city-anchor', 'desktop-search', 'mobile-search']).toContain(entry.sourceKind);
    }
  });

  it('matches every verified golden record and leaves every unverified target empty', async () => {
    const golden = await loadGolden();
    const records = await loadProvinceRecords();
    const goldenCodes = new Set(golden.map((entry) => entry.regionCode));
    const recordsByRegion = new Map<string, AgencyRecord[]>();

    for (const record of records) {
      if (!goldenCodes.has(record.regionCode)) continue;
      const list = recordsByRegion.get(record.regionCode) ?? [];
      list.push(record);
      recordsByRegion.set(record.regionCode, list);
    }

    expect([...recordsByRegion.keys()].sort()).toEqual(
      golden
        .filter((entry) => entry.expected)
        .map((entry) => entry.regionCode)
        .sort(),
    );

    for (const entry of golden) {
      const actual = recordsByRegion.get(entry.regionCode) ?? [];
      if (!entry.expected) {
        expect(actual, `${entry.regionCode} must stay empty`).toHaveLength(0);
        continue;
      }
      expect(actual, `${entry.regionCode} must contain exactly one record`).toHaveLength(1);
      expect(actual[0]).toEqual({
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

  it('locks the source evidence and unknown link states to the golden entries', async () => {
    const golden = await loadGolden();
    const fixture = await loadSources();
    const expectedEntries = golden.filter((entry) => entry.expected);
    const expectedByUrl = new Map(expectedEntries.map((entry) => [entry.sourceUrl, entry]));

    expect(fixture.checkedAt).toBe('2026-10-11T17:25:07+08:00');
    expect(fixture.maintenance).toContain('expected=false');
    expect(fixture.sources).toHaveLength(76);
    expect(duplicateValues(fixture.sources.map((source) => source.sourceUrl))).toEqual([]);
    expect(new Set(fixture.sources.map((source) => source.sourceUrl))).toEqual(
      new Set(expectedEntries.map((entry) => entry.sourceUrl)),
    );

    const mappedCodes = new Set<string>();
    for (const source of fixture.sources) {
      expect(source.sourceTitle).not.toBe('');
      expect(source.evidence).not.toBe('');
      expect(source.checkedAt).toBe(fixture.checkedAt);
      expect(Number.isInteger(source.httpStatus)).toBe(true);
      expect(source.finalUrl).toMatch(/^https?:\/\//);
      expect(duplicateValues(source.targetHosts)).toEqual([]);
      expect(new Set(source.targetHosts)).toEqual(
        new Set(source.targetMappings.map((mapping) => mapping.targetHost)),
      );
      for (const mapping of source.targetMappings) {
        mappedCodes.add(mapping.regionCode);
        const goldenEntry = expectedByUrl.get(source.sourceUrl);
        expect(goldenEntry).toBeDefined();
        const entry = expectedEntries.find(
          (candidate) => candidate.regionCode === mapping.regionCode,
        );
        expect(entry).toBeDefined();
        expect(entry?.url).toBe(mapping.targetUrl);
        expect(new URL(entry?.url ?? '').hostname).toBe(mapping.targetHost);
        expect(mapping.regionName).toBe(entry?.regionName);
      }
    }

    expect(mappedCodes).toEqual(new Set(expectedEntries.map((entry) => entry.regionCode)));
    expect(duplicateValues(fixture.anomalies.map((entry) => entry.regionCode))).toEqual([]);
    for (const anomaly of fixture.anomalies) {
      expect(anomaly.kind).not.toBe('');
      expect(anomaly.detail).not.toBe('');
      expect(expectedEntries.some((entry) => entry.regionCode === anomaly.regionCode)).toBe(true);
    }
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

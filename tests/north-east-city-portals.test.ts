import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgencyRecord, Region } from '../src/domain/schema';

type GoldenPortal = {
  regionCode: string;
  regionName: string;
  level: Region['level'];
  parentCode: string | null;
  agencyName: string;
  url: string;
  sourceUrl: string;
};

type IntermediateSourceEvidence = {
  regionCode: string;
  sourceUrl: string;
  targetHost: string;
};

type SourceEvidence = {
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
  checkedAt: string;
  httpStatus: number;
  targetHosts: string[];
  intermediateEvidence?: IntermediateSourceEvidence[];
};

type SourceEvidenceFixture = {
  checkedAt: string;
  maintenance: string;
  sources: SourceEvidence[];
};

async function readData<T>(path: string): Promise<T> {
  const content = await readFile(join(process.cwd(), 'data', path), 'utf8');
  return JSON.parse(content) as T;
}

async function readFixture<T>(name: string): Promise<T> {
  const content = await readFile(join(process.cwd(), 'tests', 'fixtures', name), 'utf8');
  return JSON.parse(content) as T;
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

describe('north and northeast city portals', () => {
  it('matches the fixed 86-entry golden snapshot exactly', async () => {
    const golden = await readFixture<GoldenPortal[]>('north-east-portals.golden.json');
    const regions = await readData<Region[]>('regions.json');
    const files = ['120000', '130000', '140000', '150000', '210000', '220000', '230000'];
    const agencies = (
      await Promise.all(files.map((file) => readData<AgencyRecord[]>(`provinces/${file}.json`)))
    ).flat();

    expect(golden, 'golden snapshot must contain the 86 verified portals').toHaveLength(86);
    expect(
      duplicateValues(golden.map((entry) => entry.regionCode)),
      'golden region codes must be unique',
    ).toEqual([]);

    const goldenCodes = new Set(golden.map((entry) => entry.regionCode));
    const actualByRegion = new Map<string, AgencyRecord[]>();
    for (const agency of agencies) {
      if (!goldenCodes.has(agency.regionCode)) continue;
      const records = actualByRegion.get(agency.regionCode) ?? [];
      records.push(agency);
      actualByRegion.set(agency.regionCode, records);
    }

    expect(
      [...actualByRegion.keys()].sort(),
      'published regions must match the golden region set exactly',
    ).toEqual([...goldenCodes].sort());

    for (const expected of golden) {
      const actual = actualByRegion.get(expected.regionCode) ?? [];
      expect(actual, `${expected.regionCode} must have exactly one published record`).toHaveLength(
        1,
      );
      expect(actual[0]).toMatchObject({
        regionCode: expected.regionCode,
        name: expected.agencyName,
        url: expected.url,
        sourceUrl: expected.sourceUrl,
        category: 'government',
      });

      const region = regions.find((candidate) => candidate.code === expected.regionCode);
      expect(region, `missing region ${expected.regionCode}`).toMatchObject({
        name: expected.regionName,
        level: expected.level,
        parentCode: expected.parentCode,
      });
    }
  });

  it('locks the verified source pages to the exact target host mapping', async () => {
    const golden = await readFixture<GoldenPortal[]>('north-east-portals.golden.json');
    const fixture = await readFixture<SourceEvidenceFixture>('north-east-portal-sources.json');
    const sourceByUrl = new Map(fixture.sources.map((source) => [source.sourceUrl, source]));

    expect(fixture.checkedAt).toBe('2026-10-11T10:18:16+08:00');
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

    const jilinSource = sourceByUrl.get('https://www.jl.gov.cn/xglj/szfbmszxszf/');
    expect(
      jilinSource?.intermediateEvidence,
      'Jilin source must preserve its two-level trace',
    ).toHaveLength(9);
    for (const intermediate of jilinSource?.intermediateEvidence ?? []) {
      const goldenEntry = golden.find((entry) => entry.regionCode === intermediate.regionCode);
      expect(
        goldenEntry,
        `missing golden entry for intermediate ${intermediate.regionCode}`,
      ).toBeDefined();
      expect(intermediate.sourceUrl).toMatch(
        /^https:\/\/www\.jl\.gov\.cn\/xglj\/szfbmszxszf\/[a-z]{3}_\d+\/$/,
      );
      expect(intermediate.sourceUrl).not.toBe(goldenEntry?.sourceUrl);
      expect(intermediate.targetHost).toBe(new URL(goldenEntry?.url ?? '').hostname);
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

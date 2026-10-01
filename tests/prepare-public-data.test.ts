import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataValidationError, preparePublicData } from '../scripts/prepare-public-data';
import type { AgencyRecord, Region } from '../src/domain/schema';

let rootDir: string;

const country: Region = {
  code: 'CN',
  name: '中国大陆',
  level: 'country',
  parentCode: null,
  sort: 0,
};

const beijing: Region = {
  code: '110000',
  name: '北京市',
  level: 'province',
  parentCode: 'CN',
  sort: 1,
};

const beijingCity: Region = {
  code: '110100',
  name: '北京市',
  level: 'city',
  parentCode: '110000',
  sort: 1,
};

const dongcheng: Region = {
  code: '110101',
  name: '东城区',
  level: 'county',
  parentCode: '110100',
  sort: 1,
};

const nationalAgency: AgencyRecord = {
  id: 'CN-government-gov-cn',
  regionCode: 'CN',
  name: '中华人民共和国中央人民政府',
  siteName: '中国政府网',
  url: 'https://www.gov.cn/',
  category: 'government',
  sourceUrl: 'https://www.gov.cn/',
};

const beijingAgency: AgencyRecord = {
  id: '110000-government-beijing-gov-cn',
  regionCode: '110000',
  name: '北京市人民政府',
  siteName: '北京市人民政府门户网站',
  url: 'https://www.beijing.gov.cn/',
  category: 'government',
  sourceUrl: 'https://www.beijing.gov.cn/',
};

const dongchengAgency: AgencyRecord = {
  id: '110101-government-dongcheng-gov-cn',
  regionCode: '110101',
  name: '东城区人民政府',
  siteName: '东城区人民政府门户网站',
  url: 'https://www.beijing.gov.cn/dongcheng/',
  category: 'government',
  sourceUrl: 'https://www.beijing.gov.cn/dongcheng/',
};

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createTrustedStaleOutput(): Promise<void> {
  await mkdir(join(rootDir, 'public', 'data'), { recursive: true });
  await mkdir(join(rootDir, 'public', 'search-index'), { recursive: true });
  await writeFile(join(rootDir, 'public', 'data', 'trusted.json'), 'trusted', 'utf8');
  await writeFile(join(rootDir, 'public', 'search-index', 'trusted.json'), 'trusted', 'utf8');
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

describe('preparePublicData', () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'gov-nav-prepare-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('copies raw data and generates shard indexes and a manifest', async () => {
    await writeJson(join(rootDir, 'data', 'regions.json'), [country, beijing]);
    await writeJson(join(rootDir, 'data', 'national.json'), [nationalAgency]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), [beijingAgency]);

    const result = await preparePublicData(rootDir);

    await expect(readJson(join(rootDir, 'public', 'data', 'regions.json'))).resolves.toEqual([
      country,
      beijing,
    ]);
    await expect(readJson(join(rootDir, 'public', 'data', 'national.json'))).resolves.toEqual([
      nationalAgency,
    ]);
    await expect(
      readJson(join(rootDir, 'public', 'data', 'provinces', '110000.json')),
    ).resolves.toEqual([beijingAgency]);

    await expect(readJson(join(rootDir, 'public', 'search-index', 'CN.json'))).resolves.toEqual([
      {
        id: nationalAgency.id,
        name: nationalAgency.name,
        siteName: nationalAgency.siteName,
        regionCode: 'CN',
        regionName: '中国大陆',
        level: 'country',
        category: 'government',
        domain: 'www.gov.cn',
        url: nationalAgency.url,
      },
    ]);
    await expect(readJson(join(rootDir, 'public', 'search-index', '110000.json'))).resolves.toEqual(
      [
        {
          id: beijingAgency.id,
          name: beijingAgency.name,
          siteName: beijingAgency.siteName,
          regionCode: '110000',
          regionName: '北京市',
          level: 'province',
          category: 'government',
          domain: 'www.beijing.gov.cn',
          url: beijingAgency.url,
        },
      ],
    );

    const manifest = await readJson<{
      generatedAt: string;
      shards: Array<{ regionCode: string; path: string; count: number }>;
    }>(join(rootDir, 'public', 'search-index', 'manifest.json'));
    expect(manifest.generatedAt).toEqual(result.generatedAt);
    expect(manifest.shards).toEqual([
      { regionCode: 'CN', path: 'search-index/CN.json', count: 1 },
      { regionCode: '110000', path: 'search-index/110000.json', count: 1 },
    ]);
    expect(result.shards).toEqual(manifest.shards);
  });

  it('accepts a county descendant in its province shard', async () => {
    await writeJson(join(rootDir, 'data', 'regions.json'), [
      country,
      beijing,
      beijingCity,
      dongcheng,
    ]);
    await writeJson(join(rootDir, 'data', 'national.json'), [nationalAgency]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), [dongchengAgency]);

    const result = await preparePublicData(rootDir);

    expect(result.shards).toEqual([
      { regionCode: 'CN', path: 'search-index/CN.json', count: 1 },
      { regionCode: '110000', path: 'search-index/110000.json', count: 1 },
    ]);
    await expect(readJson(join(rootDir, 'public', 'search-index', '110000.json'))).resolves.toEqual(
      [
        {
          id: dongchengAgency.id,
          name: dongchengAgency.name,
          siteName: dongchengAgency.siteName,
          regionCode: '110101',
          regionName: '东城区',
          level: 'county',
          category: 'government',
          domain: 'www.beijing.gov.cn',
          url: dongchengAgency.url,
        },
      ],
    );
  });

  it('rejects invalid data before replacing trusted output', async () => {
    await writeJson(join(rootDir, 'data', 'regions.json'), [country, beijing]);
    await writeJson(join(rootDir, 'data', 'national.json'), [
      { ...nationalAgency, url: 'not-a-url' },
    ]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), [beijingAgency]);
    await createTrustedStaleOutput();

    await expect(preparePublicData(rootDir)).rejects.toBeInstanceOf(DataValidationError);
    await expect(readFile(join(rootDir, 'public', 'data', 'trusted.json'), 'utf8')).resolves.toBe(
      'trusted',
    );
    await expect(
      readFile(join(rootDir, 'public', 'search-index', 'trusted.json'), 'utf8'),
    ).resolves.toBe('trusted');
  });

  it('rejects a province shard containing an agency from another province', async () => {
    const tianjin: Region = {
      code: '120000',
      name: '天津市',
      level: 'province',
      parentCode: 'CN',
      sort: 2,
    };
    const tianjinAgency: AgencyRecord = {
      ...beijingAgency,
      id: '120000-government-tianjin-gov-cn',
      regionCode: '120000',
      name: '天津市人民政府',
      siteName: '天津市人民政府门户网站',
      url: 'https://www.tj.gov.cn/',
      sourceUrl: 'https://www.tj.gov.cn/',
    };

    await writeJson(join(rootDir, 'data', 'regions.json'), [country, beijing, tianjin]);
    await writeJson(join(rootDir, 'data', 'national.json'), [nationalAgency]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), [tianjinAgency]);
    await createTrustedStaleOutput();

    await expect(preparePublicData(rootDir)).rejects.toThrow(
      /110000\.json.*regionCode 120000.*expected province 110000/s,
    );
    await expect(readFile(join(rootDir, 'public', 'data', 'trusted.json'), 'utf8')).resolves.toBe(
      'trusted',
    );
    await expect(
      readFile(join(rootDir, 'public', 'search-index', 'trusted.json'), 'utf8'),
    ).resolves.toBe('trusted');
  });

  it('rejects a province record in the national shard', async () => {
    await writeJson(join(rootDir, 'data', 'regions.json'), [country, beijing]);
    await writeJson(join(rootDir, 'data', 'national.json'), [beijingAgency]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), []);
    await createTrustedStaleOutput();

    await expect(preparePublicData(rootDir)).rejects.toThrow(
      /data\/national\.json.*regionCode 110000.*expected CN/s,
    );
    await expect(readFile(join(rootDir, 'public', 'data', 'trusted.json'), 'utf8')).resolves.toBe(
      'trusted',
    );
    await expect(
      readFile(join(rootDir, 'public', 'search-index', 'trusted.json'), 'utf8'),
    ).resolves.toBe('trusted');
  });

  it('preserves the .nojekyll deployment marker during regeneration', async () => {
    await writeJson(join(rootDir, 'data', 'regions.json'), [country, beijing]);
    await writeJson(join(rootDir, 'data', 'national.json'), [nationalAgency]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), [beijingAgency]);
    await mkdir(join(rootDir, 'public'), { recursive: true });
    await writeFile(join(rootDir, 'public', '.nojekyll'), 'existing marker\n', 'utf8');

    await preparePublicData(rootDir);

    await expect(readFile(join(rootDir, 'public', '.nojekyll'), 'utf8')).resolves.toBe(
      'existing marker\n',
    );
  });

  it('creates a .nojekyll marker when the public directory lacks one', async () => {
    await writeJson(join(rootDir, 'data', 'regions.json'), [country, beijing]);
    await writeJson(join(rootDir, 'data', 'national.json'), [nationalAgency]);
    await writeJson(join(rootDir, 'data', 'provinces', '110000.json'), [beijingAgency]);

    await preparePublicData(rootDir);

    await expect(readFile(join(rootDir, 'public', '.nojekyll'), 'utf8')).resolves.toBe('');
  });
});

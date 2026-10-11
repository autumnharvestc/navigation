import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRegionTree,
  createOfficialListFetcher,
  createRegionsMeta,
  parseOfficialListResponse,
  writeRegionData,
  type OfficialRegionNode,
} from '../scripts/import-regions';
import { MAINLAND_PROVINCE_CODES } from '../scripts/region-import-lib';

function node(
  code: string,
  name: string | null,
  level: number,
  children: OfficialRegionNode[] = [],
): OfficialRegionNode {
  return { code, name, level, children };
}

const root = node('00', null, 0, [
  node('110000000000', '北京市', 1, [
    node('110101000000', '东城区', 3),
    node('110105000000', '朝阳区', 3),
  ]),
  node('410000000000', '河南省', 1, [
    node('410100000000', '郑州市', 2),
    node('419001000000', '济源市', 3),
  ]),
  node('810000000000', '香港特别行政区', 1),
  node('资料暂缺', '台湾省', 1),
]);

const cityChildren = new Map([
  [
    '410100000000',
    [
      node('410101000000', '测试区', 3, [node('410101001000', '测试街道', 4)]),
      node('410102000000', '测试县', 3),
    ],
  ],
]);

describe('official region import transforms', () => {
  it('parses the official payload and rejects malformed or WAF responses', () => {
    const parsed = parseOfficialListResponse({
      data: root,
      status: 200,
      message: null,
    });
    expect(parsed.children?.map((item) => item.code)).toEqual([
      '110000000000',
      '410000000000',
      '810000000000',
      '资料暂缺',
    ]);
    expect(() => parseOfficialListResponse({ data: root, status: 500 })).toThrow(
      /official region response/i,
    );
    expect(() => parseOfficialListResponse('<html>WAF</html>')).toThrow(
      /official region response/i,
    );
  });

  it('builds a stable four-level tree with six-digit codes and the required groupings', () => {
    const result = buildRegionTree(
      parseOfficialListResponse({ data: root, status: 200 }),
      cityChildren,
      {
        requireAllProvinces: false,
      },
    );

    expect(result.regions.map((region) => region.code)).toEqual([
      'CN',
      '110000',
      '110100',
      '110101',
      '110105',
      '410000',
      '410100',
      '410101',
      '410102',
      '419000',
      '419001',
    ]);
    expect(result.counts).toEqual({ country: 1, province: 2, city: 3, county: 5 });
    expect(result.regions.find((region) => region.code === '110100')).toEqual({
      code: '110100',
      name: '市辖区',
      level: 'city',
      parentCode: '110000',
      sort: 1,
    });
    expect(result.regions.find((region) => region.code === '419000')).toEqual({
      code: '419000',
      name: '省直辖县级行政区划',
      level: 'city',
      parentCode: '410000',
      sort: 2,
    });
    expect(result.regions.find((region) => region.code === '419001')).toEqual({
      code: '419001',
      name: '济源市',
      level: 'county',
      parentCode: '419000',
      sort: 1,
    });
    expect(result.regions.some((region) => region.code === '4101010010')).toBe(false);
    expect(result.regions.some((region) => region.code.startsWith('810'))).toBe(false);
    expect(result.regions.some((region) => region.name === '台湾省')).toBe(false);
  });

  it('is deterministic and records actual metadata counts', () => {
    const parsed = parseOfficialListResponse({ data: root, status: 200 });
    const first = buildRegionTree(parsed, cityChildren, { requireAllProvinces: false });
    const second = buildRegionTree(parsed, cityChildren, { requireAllProvinces: false });
    const meta = createRegionsMeta(first.counts, '2026-10-11T01:30:00.000Z');

    expect(second.regions).toEqual(first.regions);
    expect(meta).toEqual({
      sourceName: '民政一体化政务服务平台（中国国家地名信息库）',
      sourceUrl: 'https://dmfw.mca.gov.cn/9095/xzqh/getList',
      retrievedAt: '2026-10-11T01:30:00.000Z',
      coverage: '中国大陆',
      levels: ['country', 'province', 'city', 'county'],
      counts: first.counts,
      transform:
        '官方接口 12 位代码转为六位代码；过滤乡镇街道；直辖市与省直辖县级单位使用稳定的导航分组节点。',
    });
  });
});

describe('prefecture-level cities without county records', () => {
  it('keeps the city node when the official API only returns streets and towns', () => {
    const directAdminRoot = node('00', null, 0, [
      node('440000000000', '广东省', 1, [node('441900000000', '东莞市', 2)]),
    ]);
    const result = buildRegionTree(
      parseOfficialListResponse({ data: directAdminRoot, status: 200 }),
      new Map([['441900000000', [node('441901000000', '测试街道', 4)]]]),
      { requireAllProvinces: false },
    );

    expect(result.regions).toContainEqual({
      code: '441900',
      name: '东莞市',
      level: 'city',
      parentCode: '440000',
      sort: 1,
    });
    expect(result.regions.filter((region) => region.parentCode === '441900')).toEqual([]);
    expect(result.counts.county).toBe(0);
  });
});

describe('region import validation failures', () => {
  it('rejects empty county-level children for ordinary prefecture-level cities', () => {
    const ordinaryRoot = node('00', null, 0, [
      node('130000000000', '河北省', 1, [node('130100000000', '石家庄市', 2)]),
    ]);

    expect(() =>
      buildRegionTree(
        parseOfficialListResponse({ data: ordinaryRoot, status: 200 }),
        new Map([['130100000000', []]]),
        { requireAllProvinces: false },
      ),
    ).toThrow(/no county-level data|county-level/i);
  });

  it('requires every stable grouping when all provinces are required', () => {
    const groupedCountyCodes = new Map([
      ['110000000000', ['110101000000']],
      ['120000000000', ['120101000000']],
      ['310000000000', ['310101000000']],
      ['500000000000', ['500101000000']],
      ['410000000000', ['419001000000']],
      ['420000000000', ['429004000000']],
      ['460000000000', ['469001000000']],
    ]);
    const completeProvinceRoot = node(
      '00',
      null,
      0,
      Array.from(MAINLAND_PROVINCE_CODES, (code) =>
        node(
          `${code}000000`,
          `测试省${code.slice(0, 2)}`,
          1,
          (groupedCountyCodes.get(`${code}000000`) ?? []).map((countyCode) =>
            node(countyCode, `测试县${countyCode.slice(4, 6)}`, 3),
          ),
        ),
      ),
    );

    expect(() =>
      buildRegionTree(
        parseOfficialListResponse({ data: completeProvinceRoot, status: 200 }),
        new Map(),
      ),
    ).toThrow(/missing required grouping 659000/);
  });

  it('fails after retry attempts are exhausted', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error('network down');
    };

    await expect(
      createOfficialListFetcher(fetchImpl)('https://example.test/regions', 2),
    ).rejects.toThrow('network down');
    expect(calls).toBe(2);
  });
});

describe('region data file transaction', () => {
  const tree = {
    regions: [
      { code: 'CN', name: '中国大陆', level: 'country' as const, parentCode: null, sort: 0 },
      { code: '110000', name: '北京市', level: 'province' as const, parentCode: 'CN', sort: 1 },
    ],
    counts: { country: 1, province: 1, city: 0, county: 0 },
  };

  it('rolls both files back when the second publish rename fails', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'gov-nav-region-write-'));
    const regionsPath = join(rootDir, 'regions.json');
    const metaPath = join(rootDir, 'regions.meta.json');
    const oldRegions = 'old regions\n';
    const oldMeta = 'old meta\n';
    let renameCalls = 0;

    try {
      await writeFile(regionsPath, oldRegions, 'utf8');
      await writeFile(metaPath, oldMeta, 'utf8');

      await expect(
        writeRegionData(tree, '2026-10-11T01:43:07.000Z', {
          dataDir: rootDir,
          operations: {
            rename: async (from, to) => {
              renameCalls += 1;
              if (renameCalls === 2) throw new Error('simulated second rename failure');
              await rename(from, to);
            },
          },
        }),
      ).rejects.toThrow('simulated second rename failure');

      expect(await readFile(regionsPath, 'utf8')).toBe(oldRegions);
      expect(await readFile(metaPath, 'utf8')).toBe(oldMeta);
      const leftovers = (await readdir(rootDir)).filter(
        (file) => file.endsWith('.new') || file.endsWith('.bak'),
      );
      expect(leftovers).toEqual([]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

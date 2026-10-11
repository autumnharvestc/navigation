import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Region } from '../src/domain/schema';

const MAINLAND_PROVINCE_CODES = [
  '110000',
  '120000',
  '130000',
  '140000',
  '150000',
  '210000',
  '220000',
  '230000',
  '310000',
  '320000',
  '330000',
  '340000',
  '350000',
  '360000',
  '370000',
  '410000',
  '420000',
  '430000',
  '440000',
  '450000',
  '460000',
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
] as const;

type RegionsMeta = {
  counts: Record<Region['level'], number>;
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), 'data', path), 'utf8')) as T;
}

describe('national region tree data', () => {
  it('contains exactly one country, 31 mainland provinces, and valid parent links', async () => {
    const regions = await readJson<Region[]>('regions.json');
    const byCode = new Map(regions.map((region) => [region.code, region]));

    expect(new Set(regions.map((region) => region.code)).size).toBe(regions.length);
    expect(regions.filter((region) => region.level === 'country')).toEqual([
      { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
    ]);
    expect(
      regions.filter((region) => region.level === 'province').map((region) => region.code),
    ).toEqual(MAINLAND_PROVINCE_CODES);

    const expectedParentLevel: Partial<Record<Region['level'], Region['level']>> = {
      province: 'country',
      city: 'province',
      county: 'city',
    } as const;

    for (const region of regions.filter((item) => item.code !== 'CN')) {
      expect(region.parentCode, `${region.code} parent`).toBeTruthy();
      const parent = byCode.get(region.parentCode as string);
      expect(parent, `${region.code} parent exists`).toBeDefined();
      expect(parent?.level, `${region.code} parent level`).toBe(expectedParentLevel[region.level]);
    }

    expect(regions.some((region) => region.code === '810000')).toBe(false);
    expect(regions.some((region) => region.code === '820000')).toBe(false);
    expect(regions.some((region) => region.name === '台湾省')).toBe(false);
  });

  it('contains at least 2800 counties and every county has a city parent', async () => {
    const regions = await readJson<Region[]>('regions.json');
    const byCode = new Map(regions.map((region) => [region.code, region]));
    const counties = regions.filter((region) => region.level === 'county');

    expect(counties.length).toBeGreaterThanOrEqual(2800);
    for (const county of counties) {
      expect(byCode.get(county.parentCode as string)?.level, `${county.code} city parent`).toBe(
        'city',
      );
    }
  });

  it('contains stable municipal and province-administered county groupings', async () => {
    const regions = await readJson<Region[]>('regions.json');

    expect(regions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: '110100',
          name: '市辖区',
          level: 'city',
          parentCode: '110000',
        }),
        expect.objectContaining({
          code: '120100',
          name: '市辖区',
          level: 'city',
          parentCode: '120000',
        }),
        expect.objectContaining({
          code: '310100',
          name: '市辖区',
          level: 'city',
          parentCode: '310000',
        }),
        expect.objectContaining({
          code: '500100',
          name: '市辖区',
          level: 'city',
          parentCode: '500000',
        }),
        expect.objectContaining({
          code: '419000',
          name: '省直辖县级行政区划',
          level: 'city',
          parentCode: '410000',
        }),
        expect.objectContaining({
          code: '429000',
          name: '省直辖县级行政区划',
          level: 'city',
          parentCode: '420000',
        }),
        expect.objectContaining({
          code: '469000',
          name: '省直辖县级行政区划',
          level: 'city',
          parentCode: '460000',
        }),
        expect.objectContaining({
          code: '659000',
          name: '自治区直辖县级行政区划',
          level: 'city',
          parentCode: '650000',
        }),
      ]),
    );
  });

  it('records source metadata whose counts match the committed tree', async () => {
    const regions = await readJson<Region[]>('regions.json');
    const meta = await readJson<RegionsMeta & { retrievedAt: string; sourceUrl: string }>(
      'regions.meta.json',
    );
    const actualCounts = {
      country: regions.filter((region) => region.level === 'country').length,
      province: regions.filter((region) => region.level === 'province').length,
      city: regions.filter((region) => region.level === 'city').length,
      county: regions.filter((region) => region.level === 'county').length,
    };

    expect(meta.counts).toEqual(actualCounts);
    expect(meta.sourceUrl).toBe('https://dmfw.mca.gov.cn/9095/xzqh/getList');
    expect(Number.isNaN(Date.parse(meta.retrievedAt))).toBe(false);
  });

  it('keeps every non-country sibling sort unique and continuous', async () => {
    const regions = await readJson<Region[]>('regions.json');
    const childrenByParent = new Map<string, Region[]>();

    for (const region of regions.filter((item) => item.parentCode !== null)) {
      const children = childrenByParent.get(region.parentCode as string) ?? [];
      children.push(region);
      childrenByParent.set(region.parentCode as string, children);
    }

    for (const [parentCode, children] of childrenByParent) {
      expect(
        children.map((child) => child.sort).sort((a, b) => a - b),
        `${parentCode} child sort`,
      ).toEqual(Array.from({ length: children.length }, (_, index) => index + 1));
    }
  });
});

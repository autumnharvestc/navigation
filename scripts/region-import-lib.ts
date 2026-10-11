import type { Region } from '../src/domain/schema';

export const SOURCE_NAME = '民政一体化政务服务平台（中国国家地名信息库）';
export const SOURCE_URL = 'https://dmfw.mca.gov.cn/9095/xzqh/getList';
export const COVERAGE = '中国大陆';
export const TRANSFORM =
  '官方接口 12 位代码转为六位代码；过滤乡镇街道；直辖市与省直辖县级单位使用稳定的导航分组节点。';

export const MAINLAND_PROVINCE_CODES = new Set([
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
]);

export const MUNICIPALITY_GROUPS = new Map([
  ['110000', { code: '110100', name: '市辖区' }],
  ['120000', { code: '120100', name: '市辖区' }],
  ['310000', { code: '310100', name: '市辖区' }],
  ['500000', { code: '500100', name: '市辖区' }],
]);

export const DIRECT_COUNTY_GROUPS = new Map([
  ['410000', { code: '419000', name: '省直辖县级行政区划' }],
  ['420000', { code: '429000', name: '省直辖县级行政区划' }],
  ['460000', { code: '469000', name: '省直辖县级行政区划' }],
  ['650000', { code: '659000', name: '自治区直辖县级行政区划' }],
]);

export const DIRECT_ADMIN_CITY_CODES = new Set(['441900', '442000', '460400', '620200']);

export type OfficialRegionNode = {
  code: string;
  name: string | null;
  level: number;
  type?: string;
  children: OfficialRegionNode[];
};

export type RegionCounts = Record<Region['level'], number>;
export type RegionTree = { regions: Region[]; counts: RegionCounts };
export type BuildRegionTreeOptions = { requireAllProvinces?: boolean };

export type RegionsMeta = {
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  coverage: string;
  levels: Region['level'][];
  counts: RegionCounts;
  transform: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseNode(value: unknown): OfficialRegionNode {
  if (!isRecord(value)) throw new Error('invalid official region response node');

  const { code, name, level, type, children } = value;
  if (
    typeof code !== 'string' ||
    (name !== null && typeof name !== 'string') ||
    !Number.isInteger(level) ||
    (type !== undefined && typeof type !== 'string') ||
    (children !== null && !Array.isArray(children))
  ) {
    throw new Error('invalid official region response node fields');
  }

  return {
    code,
    name,
    level: level as number,
    ...(typeof type === 'string' ? { type } : {}),
    children: children === null ? [] : children.map(parseNode),
  };
}

export function parseOfficialListResponse(value: unknown): OfficialRegionNode {
  if (!isRecord(value) || value.status !== 200 || !isRecord(value.data)) {
    throw new Error('invalid official region response');
  }

  const root = parseNode(value.data);
  return root;
}

function toSixDigitCode(code: string, context: string): string {
  if (!/^\d{12}$/.test(code)) {
    throw new Error(`${context}: expected a 12-digit official code, received ${code}`);
  }
  return code.slice(0, 6);
}

function requireName(node: OfficialRegionNode, context: string): string {
  if (!node.name?.trim()) throw new Error(`${context}: official region name is missing`);
  return node.name.trim();
}

function appendRegion(regions: Region[], seenCodes: Set<string>, region: Region): void {
  if (seenCodes.has(region.code)) throw new Error(`duplicate six-digit region code ${region.code}`);
  seenCodes.add(region.code);
  regions.push(region);
}

function appendCountyNodes(
  regions: Region[],
  seenCodes: Set<string>,
  nodes: OfficialRegionNode[],
  parentCode: string,
): void {
  let sort = 0;
  for (const node of nodes.filter((item) => item.level === 3)) {
    sort += 1;
    appendRegion(regions, seenCodes, {
      code: toSixDigitCode(node.code, `county ${node.name ?? node.code}`),
      name: requireName(node, `county ${node.code}`),
      level: 'county',
      parentCode,
      sort,
    });
  }
}

export function buildRegionTree(
  root: OfficialRegionNode,
  cityChildrenByCode: ReadonlyMap<string, readonly OfficialRegionNode[]>,
  options: BuildRegionTreeOptions = {},
): RegionTree {
  const regions: Region[] = [];
  const seenCodes = new Set<string>();
  const createdGroupingCodes = new Set<string>();
  appendRegion(regions, seenCodes, {
    code: 'CN',
    name: COVERAGE,
    level: 'country',
    parentCode: null,
    sort: 0,
  });

  const officialProvinces = (root.children ?? []).filter(
    (node) => node.level === 1 && /^\d{12}$/.test(node.code),
  );
  const mainlandProvinces = officialProvinces.filter((node) =>
    MAINLAND_PROVINCE_CODES.has(node.code.slice(0, 6)),
  );

  if (
    options.requireAllProvinces !== false &&
    mainlandProvinces.length !== MAINLAND_PROVINCE_CODES.size
  ) {
    throw new Error(
      `official region response contains ${mainlandProvinces.length} mainland provinces; expected ${MAINLAND_PROVINCE_CODES.size}`,
    );
  }

  for (const [provinceIndex, province] of mainlandProvinces.entries()) {
    const provinceCode = toSixDigitCode(
      province.code,
      `province ${province.name ?? province.code}`,
    );
    appendRegion(regions, seenCodes, {
      code: provinceCode,
      name: requireName(province, `province ${province.code}`),
      level: 'province',
      parentCode: 'CN',
      sort: provinceIndex + 1,
    });

    const officialChildren = province.children ?? [];
    const cityNodes = officialChildren.filter((node) => node.level === 2);
    const directCountyNodes = officialChildren.filter((node) => node.level === 3);
    let citySort = 0;

    for (const cityNode of cityNodes) {
      citySort += 1;
      const cityCode = toSixDigitCode(cityNode.code, `city ${cityNode.name ?? cityNode.code}`);
      appendRegion(regions, seenCodes, {
        code: cityCode,
        name: requireName(cityNode, `city ${cityNode.code}`),
        level: 'city',
        parentCode: provinceCode,
        sort: citySort,
      });

      const fetchedChildren = cityChildrenByCode.get(cityNode.code);
      const childNodes = [...(fetchedChildren ?? cityNode.children ?? [])];
      if (
        childNodes.every((child) => child.level !== 3) &&
        !DIRECT_ADMIN_CITY_CODES.has(cityCode)
      ) {
        throw new Error(`city ${cityCode} has no county-level data`);
      }
      appendCountyNodes(regions, seenCodes, childNodes, cityCode);
    }

    const grouping =
      MUNICIPALITY_GROUPS.get(provinceCode) ?? DIRECT_COUNTY_GROUPS.get(provinceCode);
    if (directCountyNodes.length > 0) {
      if (!grouping)
        throw new Error(`no stable navigation grouping configured for ${provinceCode}`);
      citySort += 1;
      appendRegion(regions, seenCodes, {
        code: grouping.code,
        name: grouping.name,
        level: 'city',
        parentCode: provinceCode,
        sort: citySort,
      });
      createdGroupingCodes.add(grouping.code);
      appendCountyNodes(regions, seenCodes, directCountyNodes, grouping.code);
    } else if (grouping && MUNICIPALITY_GROUPS.has(provinceCode)) {
      throw new Error(`municipality ${provinceCode} has no county-level districts`);
    }
  }

  if (options.requireAllProvinces !== false) {
    const requiredGroupingCodes = [
      ...MUNICIPALITY_GROUPS.values(),
      ...DIRECT_COUNTY_GROUPS.values(),
    ].map((grouping) => grouping.code);
    for (const requiredCode of requiredGroupingCodes) {
      if (!createdGroupingCodes.has(requiredCode)) {
        throw new Error(`missing required grouping ${requiredCode}`);
      }
    }
  }

  const counts: RegionCounts = { country: 0, province: 0, city: 0, county: 0 };
  for (const region of regions) counts[region.level] += 1;
  return { regions, counts };
}

export function createRegionsMeta(counts: RegionCounts, retrievedAt: string): RegionsMeta {
  return {
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    retrievedAt,
    coverage: COVERAGE,
    levels: ['country', 'province', 'city', 'county'],
    counts,
    transform: TRANSFORM,
  };
}

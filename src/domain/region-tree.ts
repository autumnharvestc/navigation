import type { Region } from '../domain/schema';

export type RegionIndex = {
  get(code: string): Region | undefined;
  children(code: string): Region[];
  ancestors(code: string): Region[];
  provinceOf(code: string): Region | undefined;
};

export function createRegionIndex(regions: Region[]): RegionIndex {
  const byCode = new Map<string, Region>();
  const childrenByParent = new Map<string, Region[]>();

  const compareRegions = (left: Region, right: Region): number =>
    left.sort - right.sort || left.code.localeCompare(right.code);

  for (const region of regions) {
    byCode.set(region.code, region);

    if (region.parentCode !== null) {
      const siblings = childrenByParent.get(region.parentCode) ?? [];
      siblings.push(region);
      childrenByParent.set(region.parentCode, siblings);
    }
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(compareRegions);
  }

  return {
    get(code) {
      return byCode.get(code);
    },
    children(code) {
      return [...(childrenByParent.get(code) ?? [])];
    },
    ancestors(code) {
      const ancestors: Region[] = [];
      const visited = new Set<string>([code]);
      let parentCode = byCode.get(code)?.parentCode ?? null;

      while (parentCode !== null) {
        const parent = byCode.get(parentCode);
        if (!parent || visited.has(parent.code)) break;

        ancestors.push(parent);
        visited.add(parent.code);
        parentCode = parent.parentCode;
      }

      return ancestors.reverse();
    },
    provinceOf(code) {
      const region = byCode.get(code);
      if (!region) return undefined;
      if (region.level === 'province') return region;
      if (region.level !== 'city' && region.level !== 'county') return undefined;

      return this.ancestors(code).find((ancestor) => ancestor.level === 'province');
    },
  };
}

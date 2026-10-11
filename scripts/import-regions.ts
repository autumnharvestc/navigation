import { pathToFileURL } from 'node:url';
import { writeRegionData as writeRegionDataImpl } from './region-write-transaction';
export { writeRegionDataImpl as writeRegionData };
import {
  MAINLAND_PROVINCE_CODES,
  SOURCE_URL,
  buildRegionTree,
  parseOfficialListResponse,
  type OfficialRegionNode,
  type RegionTree,
} from './region-import-lib';

export {
  buildRegionTree,
  createRegionsMeta,
  parseOfficialListResponse,
  type OfficialRegionNode,
} from './region-import-lib';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 4;
const CONCURRENCY = 2;

type FetchOfficialList = (url: string, attempts?: number) => Promise<OfficialRegionNode>;

function buildListUrl(code?: string): string {
  const url = new URL(SOURCE_URL);
  if (code) {
    url.searchParams.set('code', code);
    url.searchParams.set('level', '3');
  }
  return url.toString();
}

export function createOfficialListFetcher(fetchImpl: typeof fetch = fetch): FetchOfficialList {
  return async (url, attempts = MAX_ATTEMPTS) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            Referer: 'https://dmfw.mca.gov.cn/',
            Accept: 'application/json, text/plain, */*',
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`official region endpoint returned HTTP ${response.status}`);
        }
        const payload: unknown = await response.json();
        return parseOfficialListResponse(payload);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`official region request failed: ${String(lastError)}`);
  };
}

async function fetchCityChildren(
  fetchOfficialList: FetchOfficialList,
  cityNodes: readonly OfficialRegionNode[],
): Promise<Map<string, OfficialRegionNode[]>> {
  const result = new Map<string, OfficialRegionNode[]>();
  let nextIndex = 0;
  let failure: unknown;

  const worker = async (): Promise<void> => {
    while (nextIndex < cityNodes.length && failure === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      const city = cityNodes[index];
      if (!city) continue;
      try {
        const payload = await fetchOfficialList(buildListUrl(city.code));
        result.set(city.code, payload.children ?? []);
      } catch (error) {
        failure = error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cityNodes.length) }, async () => worker()),
  );
  if (failure !== undefined) throw failure;
  return result;
}

export async function retrieveRegionTree(
  fetchOfficialList: FetchOfficialList = createOfficialListFetcher(),
): Promise<RegionTree> {
  const root = await fetchOfficialList(buildListUrl());
  const provinces = (root.children ?? []).filter(
    (node) => node.level === 1 && MAINLAND_PROVINCE_CODES.has(node.code.slice(0, 6)),
  );
  const cityNodes = provinces.flatMap((province) =>
    (province.children ?? []).filter((node) => node.level === 2),
  );
  const cityChildrenByCode = await fetchCityChildren(fetchOfficialList, cityNodes);
  return buildRegionTree(root, cityChildrenByCode);
}

export async function importRegions(fetchImpl: typeof fetch = fetch): Promise<RegionTree> {
  const tree = await retrieveRegionTree(createOfficialListFetcher(fetchImpl));
  await writeRegionDataImpl(tree, new Date().toISOString());
  console.log(
    `imported regions: country=${tree.counts.country}, province=${tree.counts.province}, city=${tree.counts.city}, county=${tree.counts.county}`,
  );
  return tree;
}

async function main(): Promise<void> {
  try {
    await importRegions();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}

import type { SearchDocument } from './build-index';
import type { AgencyRecord, LinkStatus, Region } from '../domain/schema';

type FetchImpl = typeof fetch;

type SearchManifest = {
  generatedAt: string;
  shards: Array<{ regionCode: string; path: string; count: number }>;
};

export class DataLoadError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
  ) {
    super(`Failed to load ${path} (HTTP ${status})`);
    this.name = 'DataLoadError';
  }
}

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedPath}`;
}

async function fetchJson<T>(path: string, fetchImpl: FetchImpl): Promise<T> {
  const response = await fetchImpl(publicUrl(path));

  if (!response.ok) {
    throw new DataLoadError(publicUrl(path), response.status);
  }

  return (await response.json()) as T;
}

export async function loadRegions(fetchImpl: FetchImpl = fetch): Promise<Region[]> {
  return fetchJson<Region[]>('data/regions.json', fetchImpl);
}

export async function loadNationalAgencies(fetchImpl: FetchImpl = fetch): Promise<AgencyRecord[]> {
  return fetchJson<AgencyRecord[]>('data/national.json', fetchImpl);
}

export async function loadProvinceAgencies(
  provinceCode: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AgencyRecord[]> {
  const response = await fetchImpl(publicUrl(`data/provinces/${provinceCode}.json`));

  if (response.status === 404) return [];

  if (!response.ok) {
    throw new DataLoadError(publicUrl(`data/provinces/${provinceCode}.json`), response.status);
  }

  return (await response.json()) as AgencyRecord[];
}

export async function loadLinkStatus(
  fetchImpl: FetchImpl = fetch,
): Promise<Map<string, LinkStatus>> {
  const response = await fetchImpl(publicUrl('data/generated/link-status.json'));

  if (response.status === 404) return new Map<string, LinkStatus>();

  if (!response.ok) {
    throw new DataLoadError(publicUrl('data/generated/link-status.json'), response.status);
  }

  const statuses = (await response.json()) as LinkStatus[];
  return new Map(statuses.map((status) => [status.id, status]));
}

export async function loadSearchDocuments(fetchImpl: FetchImpl = fetch): Promise<SearchDocument[]> {
  const manifest = await fetchJson<SearchManifest>('search-index/manifest.json', fetchImpl);
  const shards = await Promise.all(
    manifest.shards.map((shard) => fetchJson<SearchDocument[]>(shard.path, fetchImpl)),
  );

  return shards.flat();
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DataLoadError,
  loadLinkStatus,
  loadNationalAgencies,
  loadProvinceAgencies,
  loadRegions,
  loadSearchDocuments,
} from '../src/data/client';
import type { AgencyRecord, LinkStatus, Region } from '../src/domain/schema';

const region: Region = {
  code: '110000',
  name: '北京市',
  level: 'province',
  parentCode: 'CN',
  sort: 1,
};

const agency: AgencyRecord = {
  id: '110000-government-beijing-gov-cn',
  regionCode: '110000',
  name: '北京市人民政府',
  siteName: '北京市人民政府门户网站',
  url: 'https://www.beijing.gov.cn/',
  category: 'government',
  sourceUrl: 'https://www.beijing.gov.cn/',
};

const linkStatus: LinkStatus = {
  id: agency.id,
  status: 'valid',
  httpStatus: 200,
  checkedAt: '2026-10-01T00:00:00.000Z',
};

function jsonResponse<T>(value: T, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('data client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads regions from the public data path', async () => {
    const fetchMock = vi.fn<typeof fetch>();

    fetchMock.mockResolvedValueOnce(jsonResponse([region]));
    await expect(loadRegions(fetchMock)).resolves.toEqual([region]);
    expect(fetchMock).toHaveBeenCalledWith('/data/regions.json');
  });

  it('loads national agencies from the public data path', async () => {
    const fetchMock = vi.fn<typeof fetch>();

    fetchMock.mockResolvedValueOnce(jsonResponse([agency]));
    await expect(loadNationalAgencies(fetchMock)).resolves.toEqual([agency]);
    expect(fetchMock).toHaveBeenCalledWith('/data/national.json');
  });

  it('loads province agencies and returns an empty list for a missing province', async () => {
    const successMock = vi.fn<typeof fetch>();
    successMock.mockResolvedValueOnce(jsonResponse([agency]));
    await expect(loadProvinceAgencies('110000', successMock)).resolves.toEqual([agency]);
    expect(successMock).toHaveBeenCalledWith('/data/provinces/110000.json');

    const missingMock = vi.fn<typeof fetch>();
    missingMock.mockResolvedValueOnce(jsonResponse([], 404));
    await expect(loadProvinceAgencies('120000', missingMock)).resolves.toEqual([]);
    expect(missingMock).toHaveBeenCalledWith('/data/provinces/120000.json');
  });

  it('returns an empty province list when the dev server serves its HTML fallback', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      new Response('<!doctype html><html><body>app</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(loadProvinceAgencies('120000', fetchMock)).resolves.toEqual([]);
  });

  it('throws DataLoadError with the request path for non-2xx responses', async () => {
    const regionsMock = vi.fn<typeof fetch>();
    regionsMock.mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));

    const error = await loadRegions(regionsMock).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataLoadError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('/data/regions.json');

    const provinceMock = vi.fn<typeof fetch>();
    provinceMock.mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));
    await expect(loadProvinceAgencies('110000', provinceMock)).rejects.toThrow(
      '/data/provinces/110000.json',
    );
  });

  it('throws DataLoadError for non-2xx HTML responses', async () => {
    const provinceMock = vi.fn<typeof fetch>();
    provinceMock.mockResolvedValueOnce(
      new Response('<!doctype html><html><body>error</body></html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(loadProvinceAgencies('110000', provinceMock)).rejects.toThrow(
      '/data/provinces/110000.json',
    );

    const statusMock = vi.fn<typeof fetch>();
    statusMock.mockResolvedValueOnce(
      new Response('<!doctype html><html><body>error</body></html>', {
        status: 503,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(loadLinkStatus(statusMock)).rejects.toThrow('/data/generated/link-status.json');
  });

  it('throws DataLoadError when national agencies are unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503));

    const error = await loadNationalAgencies(fetchMock).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataLoadError);
    expect((error as Error).message).toContain('/data/national.json');
  });

  it('combines the base URL and data path without duplicate slashes', async () => {
    vi.stubEnv('BASE_URL', '/gov-nav/');
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse([region]));

    await loadRegions(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith('/gov-nav/data/regions.json');
  });

  it('returns an empty link status map when the generated file is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse([], 404));

    await expect(loadLinkStatus(fetchMock)).resolves.toEqual(new Map());
    expect(fetchMock).toHaveBeenCalledWith('/data/generated/link-status.json');
  });

  it('returns an empty link status map when the dev server serves its HTML fallback', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      new Response('<!doctype html><html><body>app</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(loadLinkStatus(fetchMock)).resolves.toEqual(new Map());
  });

  it('throws DataLoadError for a non-2xx link status response', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));

    const error = await loadLinkStatus(fetchMock).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataLoadError);
    expect((error as Error).message).toContain('/data/generated/link-status.json');
  });

  it('loads link statuses and indexes them by id', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse([linkStatus]));

    await expect(loadLinkStatus(fetchMock)).resolves.toEqual(new Map([[agency.id, linkStatus]]));
  });

  it('throws DataLoadError when the search manifest is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));

    const error = await loadSearchDocuments(fetchMock).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataLoadError);
    expect((error as Error).message).toContain('/search-index/manifest.json');
  });

  it('throws DataLoadError when a search shard is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          generatedAt: '2026-10-01T00:00:00.000Z',
          shards: [{ regionCode: 'CN', path: 'search-index/CN.json', count: 1 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));

    const error = await loadSearchDocuments(fetchMock).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataLoadError);
    expect((error as Error).message).toContain('/search-index/CN.json');
  });

  it('loads the search manifest and merges every shard', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          generatedAt: '2026-10-01T00:00:00.000Z',
          shards: [
            { regionCode: 'CN', path: 'search-index/CN.json', count: 1 },
            { regionCode: '110000', path: 'search-index/110000.json', count: 1 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'CN-government-gov-cn',
            name: '中华人民共和国中央人民政府',
            siteName: '中国政府网',
            regionCode: 'CN',
            regionName: '中国大陆',
            level: 'country',
            category: 'government',
            domain: 'www.gov.cn',
            url: 'https://www.gov.cn/',
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: agency.id,
            name: agency.name,
            siteName: agency.siteName,
            regionCode: agency.regionCode,
            regionName: region.name,
            level: region.level,
            category: agency.category,
            domain: 'www.beijing.gov.cn',
            url: agency.url,
          },
        ]),
      );

    const documents = await loadSearchDocuments(fetchMock);

    expect(documents.map((document) => document.id)).toEqual(['CN-government-gov-cn', agency.id]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/search-index/manifest.json');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/search-index/CN.json');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/search-index/110000.json');
  });
});

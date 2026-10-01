import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLink, checkLinks, mapHttpStatus, renderLinkReport } from '../scripts/link-check-lib';

const agency = {
  id: 'a',
  regionCode: 'CN',
  name: '测试机关',
  siteName: '测试网站',
  url: 'https://example.gov.cn/',
  category: 'government' as const,
  sourceUrl: 'https://example.gov.cn/',
};
const now = () => new Date('2026-09-30T00:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('link checking', () => {
  it('maps only definitive missing responses to invalid', () => {
    expect(mapHttpStatus(200)).toBe('valid');
    expect(mapHttpStatus(301)).toBe('valid');
    expect(mapHttpStatus(403)).toBe('unknown');
    expect(mapHttpStatus(404)).toBe('invalid');
    expect(mapHttpStatus(410)).toBe('invalid');
    expect(mapHttpStatus(429)).toBe('unknown');
    expect(mapHttpStatus(500)).toBe('unknown');
  });

  it('records a network failure as unknown', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(checkLink(agency, fetchMock, now)).resolves.toEqual({
      id: 'a',
      status: 'unknown',
      checkedAt: '2026-09-30T00:00:00.000Z',
      detail: 'timeout',
    });
  });

  it('retries with GET when HEAD is not supported', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(checkLink(agency, fetchMock, now)).resolves.toEqual({
      id: 'a',
      status: 'valid',
      httpStatus: 200,
      checkedAt: '2026-09-30T00:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      agency.url,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('checks at most five links concurrently and preserves input order', async () => {
    const agencies = Array.from({ length: 8 }, (_, index) => ({
      ...agency,
      id: `agency-${index}`,
      url: `https://example-${index}.gov.cn/`,
    }));
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return new Response(null, { status: 200 });
    });

    const statuses = await checkLinks(agencies, { fetchImpl: fetchMock, now });

    expect(maxActive).toBe(5);
    expect(statuses.map((status) => status.id)).toEqual(agencies.map((item) => item.id));
    expect(statuses).toHaveLength(8);
  });

  it('renders a maintenance report with summaries and actionable records', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now());
    const agencies = [
      agency,
      { ...agency, id: 'b', name: '失效机关', siteName: '失效网站' },
      { ...agency, id: 'c', name: '待核验机关', siteName: '待核验网站' },
    ];
    const statuses = [
      {
        id: 'a',
        status: 'valid' as const,
        httpStatus: 200,
        checkedAt: '2026-09-30T00:00:00.000Z',
      },
      {
        id: 'b',
        status: 'invalid' as const,
        httpStatus: 404,
        checkedAt: '2026-09-30T00:00:00.000Z',
      },
      {
        id: 'c',
        status: 'unknown' as const,
        checkedAt: '2026-09-30T00:00:00.000Z',
        detail: 'timeout',
      },
    ];

    expect(renderLinkReport(statuses, agencies)).toBe(`# 链接巡检报告

- 生成时间：2026-09-30T00:00:00.000Z
- 总数：3
- 正常：1
- 待核验：1
- 失效：1

## 失效记录

| 机关 | 网站 | 链接 | HTTP 状态 | 检查时间 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 失效机关 | 失效网站 | https://example.gov.cn/ | 404 | 2026-09-30T00:00:00.000Z |  |

## 待核验记录

| 机关 | 网站 | 链接 | HTTP 状态 | 检查时间 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 待核验机关 | 待核验网站 | https://example.gov.cn/ | - | 2026-09-30T00:00:00.000Z | timeout |
`);
  });
});

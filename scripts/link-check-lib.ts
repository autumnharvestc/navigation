import type { AgencyRecord, LinkStatus } from '../src/domain/schema';

const CONCURRENCY = 5;
const TIMEOUT_MS = 15_000;

export type CheckOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export function mapHttpStatus(httpStatus: number): LinkStatus['status'] {
  if (httpStatus >= 200 && httpStatus < 400) return 'valid';
  if (httpStatus === 404 || httpStatus === 410) return 'invalid';
  return 'unknown';
}

export async function checkLink(
  agency: AgencyRecord,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<LinkStatus> {
  const checkedAt = now().toISOString();

  try {
    let response = await fetchImpl(agency.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 405 || response.status === 501) {
      await response.body?.cancel();
      response = await fetchImpl(agency.url, {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }

    await response.body?.cancel();

    return {
      id: agency.id,
      status: mapHttpStatus(response.status),
      httpStatus: response.status,
      checkedAt,
    };
  } catch (error) {
    return {
      id: agency.id,
      status: 'unknown',
      checkedAt,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkLinks(
  agencies: AgencyRecord[],
  options: CheckOptions = {},
): Promise<LinkStatus[]> {
  const { fetchImpl = fetch, now = () => new Date() } = options;
  const results = new Array<LinkStatus>(agencies.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < agencies.length) {
      const index = nextIndex;
      nextIndex += 1;
      const agency = agencies[index];
      if (agency) {
        results[index] = await checkLink(agency, fetchImpl, now);
      }
    }
  };

  const workerCount = Math.min(CONCURRENCY, agencies.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderLinkReport(statuses: LinkStatus[], agencies: AgencyRecord[]): string {
  const agencyById = new Map(agencies.map((agency) => [agency.id, agency]));
  const validCount = statuses.filter((status) => status.status === 'valid').length;
  const invalidStatuses = statuses.filter((status) => status.status === 'invalid');
  const unknownStatuses = statuses.filter((status) => status.status === 'unknown');

  const renderRows = (items: LinkStatus[]): string =>
    items
      .map((status) => {
        const agency = agencyById.get(status.id);
        const cells = [
          agency?.name ?? '-',
          agency?.siteName ?? '-',
          agency?.url ?? '-',
          status.httpStatus === undefined ? '-' : String(status.httpStatus),
          status.checkedAt,
          status.detail ?? '',
        ];
        return `| ${cells.map(escapeMarkdownCell).join(' | ')} |`;
      })
      .join('\n');

  return `# 链接巡检报告

- 生成时间：${new Date().toISOString()}
- 总数：${statuses.length}
- 正常：${validCount}
- 待核验：${unknownStatuses.length}
- 失效：${invalidStatuses.length}

## 失效记录

| 机关 | 网站 | 链接 | HTTP 状态 | 检查时间 | 说明 |
| --- | --- | --- | --- | --- | --- |
${renderRows(invalidStatuses)}

## 待核验记录

| 机关 | 网站 | 链接 | HTTP 状态 | 检查时间 | 说明 |
| --- | --- | --- | --- | --- | --- |
${renderRows(unknownStatuses)}
`;
}

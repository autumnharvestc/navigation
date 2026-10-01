import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgencyRecord } from '../src/domain/schema';
import { checkLinks, renderLinkReport } from './link-check-lib';

async function readJsonArray(path: string): Promise<AgencyRecord[]> {
  const content = await readFile(path, 'utf8');
  const value: unknown = JSON.parse(content);
  if (!Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON array`);
  }
  return value as AgencyRecord[];
}

async function loadAgencies(): Promise<AgencyRecord[]> {
  const nationalAgencies = await readJsonArray(join('data', 'national.json'));
  const provinceFiles = (await readdir(join('data', 'provinces')))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const provinceAgencies = (
    await Promise.all(provinceFiles.map((file) => readJsonArray(join('data', 'provinces', file))))
  ).flat();

  return [...nationalAgencies, ...provinceAgencies];
}

async function main(): Promise<void> {
  try {
    const agencies = await loadAgencies();
    const agenciesByUniqueUrl = new Map(agencies.map((agency) => [agency.url, agency]));
    const uniqueAgencies = [...agenciesByUniqueUrl.values()];
    const statuses = await checkLinks(uniqueAgencies);
    const report = renderLinkReport(statuses, uniqueAgencies);

    await mkdir(join('data', 'generated'), { recursive: true });
    await mkdir('reports', { recursive: true });
    await writeFile(
      join('data', 'generated', 'link-status.json'),
      `${JSON.stringify(statuses, null, 2)}\n`,
      'utf8',
    );
    await writeFile(join('reports', 'link-check.md'), report, 'utf8');

    const invalidCount = statuses.filter((status) => status.status === 'invalid').length;
    const unknownCount = statuses.filter((status) => status.status === 'unknown').length;
    const validCount = statuses.length - invalidCount - unknownCount;
    console.log(
      `link check complete: ${statuses.length} total, ${validCount} valid, ${unknownCount} unknown, ${invalidCount} invalid`,
    );

    if (unknownCount > 0) {
      console.warn(`warning: ${unknownCount} link(s) require manual verification`);
    }
    if (invalidCount > 0) {
      console.error(`error: ${invalidCount} link(s) are invalid`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgencyRecord, Region } from '../src/domain/schema';
import { validateDataset } from '../src/domain/validate';

async function readJsonArray<T>(path: string): Promise<T[]> {
  const content = await readFile(path, 'utf8');
  const value: unknown = JSON.parse(content);
  if (!Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON array`);
  }
  return value as T[];
}

async function main(): Promise<void> {
  const regionsPath = join('data', 'regions.json');
  const nationalPath = join('data', 'national.json');
  const provincesPath = join('data', 'provinces');

  const regions = await readJsonArray<Region>(regionsPath);
  const nationalAgencies = await readJsonArray<AgencyRecord>(nationalPath);
  const provinceFiles = (await readdir(provincesPath))
    .filter((path) => path.endsWith('.json'))
    .sort();
  const provinceAgencies = (
    await Promise.all(
      provinceFiles.map((path) => readJsonArray<AgencyRecord>(join(provincesPath, path))),
    )
  ).flat();

  const result = validateDataset({
    regions,
    agencies: [...nationalAgencies, ...provinceAgencies],
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  console.log('data validation passed');
}

await main();

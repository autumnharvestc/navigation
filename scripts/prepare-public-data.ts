import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgencyRecord, Region } from '../src/domain/schema';
import { toSearchDocument } from '../src/data/build-index';
import { validateDataset } from '../src/domain/validate';

export type SearchManifest = {
  generatedAt: string;
  shards: Array<{ regionCode: 'CN' | string; path: string; count: number }>;
};

export type PrepareResult = {
  generatedAt: string;
  shards: SearchManifest['shards'];
};

export class DataValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('\n'));
    this.name = 'DataValidationError';
  }
}

async function readJsonArray<T>(path: string): Promise<T[]> {
  const content = await readFile(path, 'utf8');
  const value: unknown = JSON.parse(content);
  if (!Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON array`);
  }
  return value as T[];
}

export async function preparePublicData(rootDir: string): Promise<PrepareResult> {
  const dataDir = join(rootDir, 'data');
  const provincesDir = join(dataDir, 'provinces');
  const publicDataDir = join(rootDir, 'public', 'data');
  const publicProvincesDir = join(publicDataDir, 'provinces');
  const searchIndexDir = join(rootDir, 'public', 'search-index');

  const regionsPath = join(dataDir, 'regions.json');
  const nationalPath = join(dataDir, 'national.json');
  const regions = await readJsonArray<Region>(regionsPath);
  const nationalAgencies = await readJsonArray<AgencyRecord>(nationalPath);
  const provinceFiles = (await readdir(provincesDir))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const provinceAgencies = await Promise.all(
    provinceFiles.map((file) => readJsonArray<AgencyRecord>(join(provincesDir, file))),
  );

  const validationResult = validateDataset({
    regions,
    agencies: [...nationalAgencies, ...provinceAgencies.flat()],
  });
  const errors = [...validationResult.errors];
  for (const [index, file] of provinceFiles.entries()) {
    const expectedRegionCode = file.replace(/\.json$/, '');
    for (const agency of provinceAgencies[index] ?? []) {
      if (agency.regionCode !== expectedRegionCode) {
        errors.push(
          `data/provinces/${file}: agency ${agency.id} has regionCode ${agency.regionCode}; expected ${expectedRegionCode}`,
        );
      }
    }
  }
  if (errors.length > 0) {
    throw new DataValidationError(errors);
  }

  await Promise.all([
    rm(publicDataDir, { recursive: true, force: true }),
    rm(searchIndexDir, { recursive: true, force: true }),
  ]);
  await mkdir(publicProvincesDir, { recursive: true });
  await mkdir(searchIndexDir, { recursive: true });

  await copyFile(regionsPath, join(publicDataDir, 'regions.json'));
  await copyFile(nationalPath, join(publicDataDir, 'national.json'));
  await Promise.all(
    provinceFiles.map((file) => copyFile(join(provincesDir, file), join(publicProvincesDir, file))),
  );

  const regionByCode = new Map(regions.map((region) => [region.code, region]));
  const shards: SearchManifest['shards'] = [];
  const writeSearchShard = async (regionCode: string, agencies: AgencyRecord[]) => {
    const documents = agencies.map((agency) =>
      toSearchDocument(agency, regionByCode.get(agency.regionCode) as Region),
    );
    const relativePath = `search-index/${regionCode}.json`;
    await writeFile(
      join(searchIndexDir, `${regionCode}.json`),
      `${JSON.stringify(documents, null, 2)}\n`,
      'utf8',
    );
    shards.push({ regionCode, path: relativePath, count: documents.length });
  };

  await writeSearchShard('CN', nationalAgencies);
  for (const [index, file] of provinceFiles.entries()) {
    await writeSearchShard(file.replace(/\.json$/, ''), provinceAgencies[index] as AgencyRecord[]);
  }

  const manifest: SearchManifest = {
    generatedAt: new Date().toISOString(),
    shards,
  };
  await writeFile(
    join(searchIndexDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return { generatedAt: manifest.generatedAt, shards: manifest.shards };
}

async function main(): Promise<void> {
  try {
    await preparePublicData(process.cwd());
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}

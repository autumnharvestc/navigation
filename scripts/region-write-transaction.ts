import {
  access as fsAccess,
  copyFile as fsCopyFile,
  mkdir as fsMkdir,
  rename as fsRename,
  rm as fsRm,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createRegionsMeta, type RegionTree } from './region-import-lib';

export type RegionWriteOperations = {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>;
  copyFile: (source: string, destination: string) => Promise<void>;
  rename: (source: string, destination: string) => Promise<void>;
  rm: (path: string, options: { force: true }) => Promise<void>;
  access: (path: string) => Promise<void>;
};

export type WriteRegionDataOptions = {
  dataDir?: string;
  operations?: Partial<RegionWriteOperations>;
};

const defaultRegionWriteOperations: RegionWriteOperations = {
  mkdir: (path, options) => fsMkdir(path, options),
  writeFile: (path, data, encoding) => fsWriteFile(path, data, encoding),
  copyFile: (source, destination) => fsCopyFile(source, destination),
  rename: (source, destination) => fsRename(source, destination),
  rm: (path, options) => fsRm(path, options),
  access: (path) => fsAccess(path),
};

async function fileExists(access: RegionWriteOperations['access'], path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function writeRegionData(
  tree: RegionTree,
  retrievedAt: string,
  options: WriteRegionDataOptions = {},
): Promise<void> {
  const operations = { ...defaultRegionWriteOperations, ...options.operations };
  const dataDir = options.dataDir ?? join(process.cwd(), 'data');
  const regionsPath = join(dataDir, 'regions.json');
  const metaPath = join(dataDir, 'regions.meta.json');
  const transactionId = `${process.pid}.${Date.now()}`;
  const regionsTemporaryPath = `${regionsPath}.${transactionId}.new`;
  const metaTemporaryPath = `${metaPath}.${transactionId}.new`;
  const regionsBackupPath = `${regionsPath}.${transactionId}.bak`;
  const metaBackupPath = `${metaPath}.${transactionId}.bak`;
  let regionsBackedUp = false;
  let metaBackedUp = false;
  let regionsPublished = false;
  let metaPublished = false;

  const cleanup = async (): Promise<void> => {
    await Promise.all([
      operations.rm(regionsTemporaryPath, { force: true }),
      operations.rm(metaTemporaryPath, { force: true }),
      operations.rm(regionsBackupPath, { force: true }),
      operations.rm(metaBackupPath, { force: true }),
    ]);
  };

  await operations.mkdir(dataDir, { recursive: true });

  try {
    await operations.writeFile(
      regionsTemporaryPath,
      `${JSON.stringify(tree.regions, null, 2)}\n`,
      'utf8',
    );
    await operations.writeFile(
      metaTemporaryPath,
      `${JSON.stringify(createRegionsMeta(tree.counts, retrievedAt), null, 2)}\n`,
      'utf8',
    );

    if (await fileExists(operations.access, regionsPath)) {
      await operations.copyFile(regionsPath, regionsBackupPath);
      regionsBackedUp = true;
    }
    if (await fileExists(operations.access, metaPath)) {
      await operations.copyFile(metaPath, metaBackupPath);
      metaBackedUp = true;
    }

    await operations.rename(regionsTemporaryPath, regionsPath);
    regionsPublished = true;
    await operations.rename(metaTemporaryPath, metaPath);
    metaPublished = true;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    const rollback = async (operation: () => Promise<void>): Promise<void> => {
      try {
        await operation();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    };

    if (regionsPublished || regionsBackedUp) {
      await rollback(() => operations.rm(regionsPath, { force: true }));
    }
    if (metaPublished || metaBackedUp) {
      await rollback(() => operations.rm(metaPath, { force: true }));
    }
    if (regionsBackedUp) {
      await rollback(() => operations.rename(regionsBackupPath, regionsPath));
    }
    if (metaBackedUp) {
      await rollback(() => operations.rename(metaBackupPath, metaPath));
    }
    await rollback(cleanup);

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'region data write failed and rollback was incomplete',
        { cause: error },
      );
    }
    throw error;
  }

  await cleanup();
}

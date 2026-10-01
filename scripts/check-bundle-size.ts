import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUNDLE_SIZE_LIMIT = 250 * 1024;

async function listJavaScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJavaScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main(): Promise<void> {
  try {
    const files = await listJavaScriptFiles(join(process.cwd(), 'dist', 'assets'));
    const buffers = await Promise.all(files.map((file) => readFile(file)));
    const bytes = buffers.reduce((total, buffer) => total + gzipSync(buffer).length, 0);

    if (bytes > BUNDLE_SIZE_LIMIT) {
      console.error(`bundle size failed: ${bytes} bytes (limit ${BUNDLE_SIZE_LIMIT} bytes)`);
      process.exitCode = 1;
      return;
    }

    console.log(`bundle size passed: ${bytes} bytes`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}

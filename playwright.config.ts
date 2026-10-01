import { defineConfig } from '@playwright/test';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/';
const previewOrigin = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: previewOrigin,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --strictPort',
    url: `${previewOrigin}${githubPagesBase}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

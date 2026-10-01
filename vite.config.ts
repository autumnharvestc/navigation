import { defaultExclude, defineConfig } from 'vitest/config';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/';

export default defineConfig({
  base: githubPagesBase,
  build: { target: 'es2022' },
  test: {
    environment: 'happy-dom',
    exclude: [...defaultExclude, 'tests/e2e/**'],
    coverage: { reporter: ['text', 'html'] },
  },
});

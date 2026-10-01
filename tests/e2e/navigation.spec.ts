import { expect, test } from '@playwright/test';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/';
const previewOrigin = 'http://127.0.0.1:4173';

test('loads the production preview at the GitHub Pages base path', async ({ page }) => {
  await page.goto(githubPagesBase);
  await expect(page).toHaveURL(`${previewOrigin}${githubPagesBase}`);
  await expect(page.getByRole('heading', { name: '中国大陆政府机构官网导航' })).toBeVisible();
});

test('navigates from home to national and Beijing directories', async ({ page }) => {
  await page.goto(githubPagesBase);
  await expect(page.getByRole('heading', { name: '中国大陆政府机构官网导航' })).toBeVisible();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '国家级' })
    .click();
  await expect(page.getByText('中国政府网', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '查看来源' }).first()).toBeVisible();
  await expect(page.getByText('最后核验时间').first()).toBeVisible();
  await page.goto(`${githubPagesBase}#/region/110000`);
  await expect(page.getByRole('heading', { level: 1, name: /北京市/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: /北京市人民政府/ })).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('navigates from home to national and Beijing directories', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '中国大陆政府机构官网导航' })).toBeVisible();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '国家级' })
    .click();
  await expect(page.getByText('中国政府网')).toBeVisible();
  await page.goto('/#/region/110000');
  await expect(page.getByRole('heading', { level: 1, name: /北京市/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: /北京市人民政府/ })).toBeVisible();
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell, startApp } from '../src/app';
import {
  loadNationalAgencies as loadNationalAgenciesImpl,
  loadRegions as loadRegionsImpl,
} from '../src/data/client';
import type { AgencyRecord, Region } from '../src/domain/schema';

const regions: Region[] = [
  { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
  { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
];

const agency: AgencyRecord = {
  id: 'CN-government-gov-cn',
  regionCode: 'CN',
  name: '中华人民共和国中央人民政府',
  siteName: '中国政府网',
  url: 'https://www.gov.cn/',
  category: 'government',
  sourceUrl: 'https://www.gov.cn/',
};

function createDependencies() {
  return {
    loadRegions: vi.fn<typeof loadRegionsImpl>().mockResolvedValue(regions),
    loadNationalAgencies: vi.fn<typeof loadNationalAgenciesImpl>().mockResolvedValue([agency]),
  };
}

describe('renderShell', () => {
  it('renders the global navigation and current title', () => {
    const root = document.createElement('div');
    renderShell(root, { kind: 'home' });
    expect(root.querySelector('header')?.textContent).toContain('国家级');
    expect(root.querySelector('h1')?.textContent).toContain('中国大陆政府机构官网导航');
  });

  it('renders a custom title as text rather than HTML', () => {
    const root = document.createElement('div');
    const title = '<img src="x" onerror="alert(1)">';

    renderShell(root, { kind: 'home' }, { title });

    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.brand')?.textContent).toBe(title);
    expect(root.querySelector('h1')?.textContent).toBe(title);
  });
});

describe('startApp', () => {
  afterEach(() => {
    location.hash = '';
  });

  it('loads and renders the home route', async () => {
    location.hash = '#/';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    expect(root.textContent).toContain('正在加载');
    await vi.waitFor(() => {
      expect(root.querySelector('a[href="#/region/110000"]')).not.toBeNull();
    });
    expect(dependencies.loadRegions).toHaveBeenCalledTimes(1);

    cleanup();
    root.remove();
  });

  it('loads regions and national agencies in parallel for the national route', async () => {
    location.hash = '#/national';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="https://www.gov.cn/"]')).not.toBeNull();
    });
    expect(dependencies.loadRegions).toHaveBeenCalledTimes(1);
    expect(dependencies.loadNationalAgencies).toHaveBeenCalledTimes(1);

    cleanup();
    root.remove();
  });

  it('shows an error and retries the current route', async () => {
    location.hash = '#/';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    dependencies.loadRegions
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(regions);
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('数据加载失败');
    });
    root.querySelector<HTMLButtonElement>('button')?.click();

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="#/region/110000"]')).not.toBeNull();
    });
    expect(dependencies.loadRegions).toHaveBeenCalledTimes(2);

    cleanup();
    root.remove();
  });

  it('removes its hashchange listener on cleanup', async () => {
    location.hash = '#/';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="#/region/110000"]')).not.toBeNull();
    });
    cleanup();

    location.hash = '#/national';
    window.dispatchEvent(new Event('hashchange'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dependencies.loadNationalAgencies).not.toHaveBeenCalled();
    expect(root.querySelector('a[href="#/region/110000"]')).not.toBeNull();

    root.remove();
  });
});

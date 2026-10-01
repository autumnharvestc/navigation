import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell, startApp } from '../src/app';
import {
  loadLinkStatus as loadLinkStatusImpl,
  loadNationalAgencies as loadNationalAgenciesImpl,
  loadProvinceAgencies as loadProvinceAgenciesImpl,
  loadRegions as loadRegionsImpl,
  loadSearchDocuments as loadSearchDocumentsImpl,
} from '../src/data/client';
import type { AgencyRecord, Region } from '../src/domain/schema';

const regions: Region[] = [
  { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
  { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
  { code: '110100', name: '市辖区', level: 'city', parentCode: '110000', sort: 1 },
  { code: '120000', name: '天津市', level: 'province', parentCode: 'CN', sort: 2 },
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

const searchDocument = {
  id: '110000-court-bjgy-bjcourt-gov-cn',
  name: '北京市高级人民法院',
  siteName: '北京市高级人民法院',
  regionCode: '110000',
  regionName: '北京市',
  level: 'province',
  category: 'court',
  domain: 'bjgy.bjcourt.gov.cn',
  url: 'https://bjgy.bjcourt.gov.cn/',
} as const;

const beijingAgency: AgencyRecord = {
  id: '110000-government-beijing-gov-cn',
  regionCode: '110000',
  name: '北京市人民政府',
  siteName: '北京市人民政府门户网站',
  url: 'https://www.beijing.gov.cn/',
  category: 'government',
  sourceUrl: 'https://www.beijing.gov.cn/',
};

function createDependencies() {
  return {
    loadRegions: vi.fn<typeof loadRegionsImpl>().mockResolvedValue(regions),
    loadNationalAgencies: vi.fn<typeof loadNationalAgenciesImpl>().mockResolvedValue([agency]),
    loadSearchDocuments: vi
      .fn<typeof loadSearchDocumentsImpl>()
      .mockResolvedValue([searchDocument]),
    loadProvinceAgencies: vi.fn<typeof loadProvinceAgenciesImpl>().mockResolvedValue([]),
    loadLinkStatus: vi.fn<typeof loadLinkStatusImpl>().mockResolvedValue(new Map()),
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
    vi.clearAllTimers();
    vi.useRealTimers();
    location.hash = '';
    vi.restoreAllMocks();
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
    expect(dependencies.loadSearchDocuments).not.toHaveBeenCalled();

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

  it('renders a region from its province shard with breadcrumbs', async () => {
    location.hash = '#/region/110000';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    dependencies.loadProvinceAgencies.mockResolvedValue([beijingAgency]);
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="https://www.beijing.gov.cn/"]')).not.toBeNull();
    });
    expect(root.querySelector('nav[aria-label="面包屑"]')?.textContent).toContain('中国大陆');
    expect(dependencies.loadProvinceAgencies).toHaveBeenCalledWith('110000');
    expect(dependencies.loadLinkStatus).not.toHaveBeenCalled();
    expect(dependencies.loadSearchDocuments).not.toHaveBeenCalled();

    cleanup();
    root.remove();
  });

  it('loads search documents and link status only for the search route', async () => {
    location.hash = '#/search';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="https://bjgy.bjcourt.gov.cn/"]')).not.toBeNull();
    });
    expect(dependencies.loadSearchDocuments).toHaveBeenCalledTimes(1);
    expect(dependencies.loadLinkStatus).toHaveBeenCalledTimes(1);

    cleanup();
    root.remove();
  });

  it('updates the search URL without reloading the route or losing input focus', async () => {
    location.hash = '#/search';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('input[type="search"]')).not.toBeNull();
    });
    expect(dependencies.loadSearchDocuments).toHaveBeenCalledTimes(1);
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.focus();

    const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
    input.value = '人民政府';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '#/search?q=%E4%BA%BA%E6%B0%91%E6%94%BF%E5%BA%9C',
    );
    expect(dependencies.loadSearchDocuments).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);

    cleanup();
    root.remove();
  });

  it('clears a pending search debounce when navigation leaves the search route', async () => {
    location.hash = '#/search';
    // Flush the hashchange event happy-dom schedules for the URL change before the
    // app registers its listener, so it cannot trigger an extra route render.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('input[type="search"]')).not.toBeNull();
    });
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;

    input.value = '人民政府';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Navigate deterministically: set the hash and dispatch hashchange ourselves
    // instead of relying on happy-dom's async scheduling.
    location.hash = '#/';
    window.dispatchEvent(new Event('hashchange'));

    // Wait past the 200ms debounce window with real timers; the pending debounce
    // must have been cleared, otherwise it would rewrite the hash to '#/search?...'.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(location.hash).toBe('#/');
    expect(dependencies.loadSearchDocuments).toHaveBeenCalledTimes(1);
    expect(root.querySelector('input[type="search"]')).toBeNull();

    cleanup();
    root.remove();
  });

  it('shows a search error and retries the current route', async () => {
    location.hash = '#/search';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    dependencies.loadSearchDocuments
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce([searchDocument]);
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('数据加载失败');
    });
    root.querySelector<HTMLButtonElement>('button')?.click();

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="https://bjgy.bjcourt.gov.cn/"]')).not.toBeNull();
    });
    expect(dependencies.loadSearchDocuments).toHaveBeenCalledTimes(2);

    cleanup();
    root.remove();
  });

  it('loads national agencies for the country region without a province shard', async () => {
    location.hash = '#/region/CN';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="https://www.gov.cn/"]')).not.toBeNull();
    });

    const breadcrumb = root.querySelector('nav[aria-label="面包屑"]');
    expect(breadcrumb?.textContent).toBe('中国大陆');
    expect(breadcrumb?.querySelectorAll('li')).toHaveLength(1);
    expect(breadcrumb?.querySelector('a')).toBeNull();
    expect(dependencies.loadNationalAgencies).toHaveBeenCalledTimes(1);
    expect(dependencies.loadProvinceAgencies).not.toHaveBeenCalled();

    cleanup();
    root.remove();
  });

  it('resolves a city route to its province shard', async () => {
    location.hash = '#/region/110100';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.querySelector('h1')?.textContent).toContain('市辖区');
    });
    expect(root.querySelector('nav[aria-label="面包屑"]')?.textContent).toContain('北京市');
    expect(dependencies.loadProvinceAgencies).toHaveBeenCalledWith('110000');

    cleanup();
    root.remove();
  });

  it('shows the framework empty state for a province without data', async () => {
    location.hash = '#/region/120000';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('数据框架已建立，数据待补全');
    });
    expect(dependencies.loadProvinceAgencies).toHaveBeenCalledWith('120000');

    cleanup();
    root.remove();
  });

  it('shows a missing region and a home link', async () => {
    location.hash = '#/region/999999';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('地区不存在');
    });
    expect(
      Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href="#/"]')).some(
        (link) => link.textContent === '返回首页',
      ),
    ).toBe(true);
    expect(dependencies.loadProvinceAgencies).not.toHaveBeenCalled();

    cleanup();
    root.remove();
  });

  it('shows a region error and retries the current route', async () => {
    location.hash = '#/region/110000';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = document.createElement('div');
    document.body.append(root);
    const dependencies = createDependencies();
    dependencies.loadProvinceAgencies
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce([beijingAgency]);
    const cleanup = startApp(root, { dependencies });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('数据加载失败');
    });
    root.querySelector<HTMLButtonElement>('button')?.click();

    await vi.waitFor(() => {
      expect(root.querySelector('a[href="https://www.beijing.gov.cn/"]')).not.toBeNull();
    });
    expect(dependencies.loadProvinceAgencies).toHaveBeenCalledTimes(2);

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

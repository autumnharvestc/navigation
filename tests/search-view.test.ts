import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderSearchView } from '../src/views/search';
import type { SearchDocument } from '../src/data/build-index';

afterEach(() => vi.useRealTimers());

const documents: SearchDocument[] = [
  {
    id: 'gov',
    name: '北京市人民政府',
    siteName: '北京市人民政府门户网站',
    regionCode: '110000',
    regionName: '北京市',
    level: 'province',
    category: 'government',
    domain: 'www.beijing.gov.cn',
    url: 'https://www.beijing.gov.cn/',
  },
  {
    id: 'court',
    name: '北京市高级人民法院',
    siteName: '北京市高级人民法院',
    regionCode: '110000',
    regionName: '北京市',
    level: 'province',
    category: 'court',
    domain: 'bjgy.bjcourt.gov.cn',
    url: 'https://bjgy.bjcourt.gov.cn/',
  },
];

describe('renderSearchView', () => {
  it('filters by query and category, and updates the hash after debounce', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    renderSearchView(root, {
      documents,
      statusMap: new Map([
        ['court', { id: 'court', status: 'valid', checkedAt: '2026-09-30T00:00:00.000Z' }],
      ]),
      initialQuery: '法院',
    });

    expect(root.querySelectorAll('[data-testid="search-result"]')).toHaveLength(1);
    expect(root.querySelector('.status-badge')?.textContent).toBe('正常');
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = '人民政府';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(location.hash).toBe('#/search?q=%E4%BA%BA%E6%B0%91%E6%94%BF%E5%BA%9C');
  });

  it('filters by category and level, and explains when nothing matches', () => {
    const root = document.createElement('div');
    renderSearchView(root, {
      documents,
      statusMap: new Map(),
      initialQuery: '',
    });

    expect(root.querySelectorAll('[data-testid="search-result"]')).toHaveLength(2);

    const category = root.querySelector<HTMLSelectElement>('select[data-filter="category"]')!;
    category.value = 'government';
    category.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('[data-testid="search-result"]')).toHaveLength(1);

    const level = root.querySelector<HTMLSelectElement>('select[data-filter="level"]')!;
    level.value = 'country';
    level.dispatchEvent(new Event('change', { bubbles: true }));

    expect(root.querySelectorAll('[data-testid="search-result"]')).toHaveLength(0);
    expect(root.textContent).toContain('未找到匹配的官方网站');
    expect(root.textContent).toContain('尝试缩短关键词或清除筛选条件');
  });
});

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
    sourceUrl: 'https://www.beijing.gov.cn/',
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
    sourceUrl: 'https://bjgy.bjcourt.gov.cn/',
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
    const linkTexts = Array.from(root.querySelectorAll('a')).map((link) => link.textContent);
    expect(linkTexts).toContain('打开官网');
    expect(linkTexts).toContain('查看来源');
    expect(root.textContent).toContain('最后核验时间');
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = '人民政府';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(location.hash).toBe('#/search?q=%E4%BA%BA%E6%B0%91%E6%94%BF%E5%BA%9C');
  });

  it('debounces repeated input and updates the URL only once for the final query', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    renderSearchView(root, { documents, statusMap: new Map(), initialQuery: '' });
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    for (const [value, elapsed] of [
      ['北', 150],
      ['北京', 150],
      ['北京市', 150],
    ] as const) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(elapsed);
    }

    expect(replaceState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '#/search?q=%E5%8C%97%E4%BA%AC%E5%B8%82');
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

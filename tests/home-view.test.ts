import { describe, expect, it } from 'vitest';
import { escapeHtml, requiredElement } from '../src/ui/dom';
import { renderHomeView } from '../src/views/home';
import type { Region } from '../src/domain/schema';

function createRegions(provinceCount: number): Region[] {
  const provinces = Array.from({ length: provinceCount }, (_, index): Region => ({
    code: `${110000 + index}`,
    name: `测试省${index + 1}`,
    level: 'province',
    parentCode: 'CN',
    sort: index + 1,
  }));

  return [
    { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
    ...provinces,
  ];
}

describe('renderHomeView', () => {
  it('links to national and province directories and shows coverage', () => {
    const root = document.createElement('div');
    renderHomeView(root, createRegions(31));

    expect(root.querySelector('a[href="#/national"]')?.textContent).toContain('国家级');
    expect(root.querySelector('a[href="#/search"]')?.textContent).toContain('全域搜索');
    expect(root.querySelector('a[href="#/region/110000"]')?.textContent).toContain('测试省1');
    expect(root.querySelector('[data-testid="province-count"]')?.textContent).toBe('31');
  });

  it('renders available provinces and explains incomplete coverage', () => {
    const root = document.createElement('div');
    renderHomeView(root, createRegions(2));

    expect(root.querySelectorAll('a[href^="#/region/"]')).toHaveLength(2);
    expect(root.querySelector('[data-testid="province-count"]')?.textContent).toBe('2');
    expect(root.textContent).toContain('数据框架已建立，数据待补全');
  });
});

describe('DOM helpers', () => {
  it('escapes HTML syntax characters', () => {
    expect(escapeHtml('<img src="x"> & \'')).toBe('&lt;img src=&quot;x&quot;&gt; &amp; &#039;');
  });

  it('returns a required element or throws a descriptive error', () => {
    const root = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'child';
    root.append(child);

    expect(requiredElement(root, '.child')).toBe(child);
    expect(() => requiredElement(root, '.missing')).toThrow('Missing required element: .missing');
  });
});

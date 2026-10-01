import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderNationalView } from '../src/views/national';
import type { AgencyRecord } from '../src/domain/schema';

const agency: AgencyRecord = {
  id: 'CN-government-gov-cn',
  regionCode: 'CN',
  name: '<img src="x" onerror="alert(1)">',
  siteName: '<script>alert(1)</script>',
  url: 'https://www.gov.cn/',
  category: 'government',
  sourceUrl: 'https://www.gov.cn/',
};

describe('renderNationalView', () => {
  it('groups agencies by category and safely opens official sites', () => {
    const root = document.createElement('div');
    renderNationalView(root, [agency]);

    expect(root.querySelector('h2[data-category="government"]')?.textContent).toContain('政府');
    const link = root.querySelector<HTMLAnchorElement>('a[href="https://www.gov.cn/"]');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
    expect(link?.rel).toContain('noreferrer');
    expect(root.querySelector('img, script')).toBeNull();
    expect(root.textContent).toContain('<img src="x" onerror="alert(1)">');
    expect(root.textContent).toContain('<script>alert(1)</script>');
    expect(root.textContent).toContain('www.gov.cn');
  });

  it('renders categories in the fixed order and omits empty categories', () => {
    const root = document.createElement('div');
    renderNationalView(root, [
      { ...agency, id: 'government', category: 'government' },
      { ...agency, id: 'party', category: 'party' },
    ]);

    expect(root.querySelectorAll('h2[data-category]')).toHaveLength(2);
    expect(
      Array.from(root.querySelectorAll<HTMLHeadingElement>('h2[data-category]')).map(
        (item) => item.dataset.category,
      ),
    ).toEqual(['party', 'government']);
  });

  it('explains that an empty directory is waiting for data', () => {
    const root = document.createElement('div');
    renderNationalView(root, []);

    expect(root.querySelector('h2[data-category]')).toBeNull();
    expect(root.textContent).toContain('数据框架已建立，数据待补全');
  });
});

describe('renderAgencyCard copy action', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('changes the copy button text when clipboard access fails', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const root = document.createElement('div');
    renderNationalView(root, [agency]);
    root.querySelector<HTMLButtonElement>('button')?.click();

    await vi.waitFor(() => {
      expect(root.querySelector('button')?.textContent).toBe('复制失败');
    });
    expect(writeText).toHaveBeenCalledWith('https://www.gov.cn/');
  });
});

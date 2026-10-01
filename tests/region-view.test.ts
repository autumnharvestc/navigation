import { describe, expect, it } from 'vitest';
import { renderRegionView } from '../src/views/region';

describe('renderRegionView', () => {
  it('shows breadcrumbs, child regions and agency links', () => {
    const root = document.createElement('div');
    renderRegionView(root, {
      region: { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
      ancestors: [{ code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 }],
      children: [{ code: '110100', name: '市辖区', level: 'city', parentCode: '110000', sort: 1 }],
      agencies: [
        {
          id: '110000-government-beijing-gov-cn',
          regionCode: '110000',
          name: '北京市人民政府',
          siteName: '北京市人民政府门户网站',
          url: 'https://www.beijing.gov.cn/',
          category: 'government',
          sourceUrl: 'https://www.beijing.gov.cn/',
        },
      ],
      statusMap: new Map(),
    });

    expect(root.querySelector('nav[aria-label="面包屑"]')?.textContent).toContain('中国大陆');
    expect(root.querySelector('a[href="#/region/110100"]')?.textContent).toContain('市辖区');
    expect(root.querySelector('a[href="https://www.beijing.gov.cn/"]')).not.toBeNull();
  });

  it('explains that an empty directory is waiting for data', () => {
    const root = document.createElement('div');
    renderRegionView(root, {
      region: { code: '120000', name: '天津市', level: 'province', parentCode: 'CN', sort: 2 },
      ancestors: [{ code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 }],
      children: [],
      agencies: [],
      statusMap: new Map(),
    });
    expect(root.textContent).toContain('数据框架已建立，数据待补全');
  });
});

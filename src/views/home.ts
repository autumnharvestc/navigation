import { toHash } from '../router';
import type { Region } from '../domain/schema';

export function renderHomeView(root: HTMLElement, regions: Region[]): void {
  const heading = document.createElement('h1');
  heading.textContent = '中国大陆政府机构官网导航';

  const searchLink = document.createElement('a');
  searchLink.className = 'button button--primary';
  searchLink.href = '#/search';
  searchLink.textContent = '全域搜索';

  const nationalLink = document.createElement('a');
  nationalLink.className = 'button';
  nationalLink.href = toHash({ kind: 'national' });
  nationalLink.textContent = '国家级';

  const quickLinks = document.createElement('div');
  quickLinks.className = 'quick-links';
  quickLinks.append(searchLink, nationalLink);

  const provinces = regions
    .filter((region) => region.level === 'province')
    .sort((left, right) => left.sort - right.sort || left.code.localeCompare(right.code));

  const count = document.createElement('span');
  count.dataset.testid = 'province-count';
  count.textContent = String(provinces.length);

  const coverage = document.createElement('p');
  coverage.className = 'coverage';
  coverage.append('已收录 ', count, ' 个省级行政区');

  const list = document.createElement('ul');
  list.className = 'province-list';
  for (const region of provinces) {
    const link = document.createElement('a');
    link.href = toHash({ kind: 'region', regionCode: region.code });
    link.textContent = region.name;

    const item = document.createElement('li');
    item.append(link);
    list.append(item);
  }

  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = '省级目录';

  const section = document.createElement('section');
  section.className = 'directory-section';
  section.append(sectionTitle, coverage, list);

  if (provinces.length < 31) {
    const notice = document.createElement('p');
    notice.className = 'empty-state';
    notice.textContent = '数据框架已建立，数据待补全';
    section.append(notice);
  }

  root.replaceChildren(heading, quickLinks, section);
}

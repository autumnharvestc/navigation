import { renderAgencyCard, agencyCategoryTitles } from '../components/agency-card';
import type { AgencyCategory, AgencyRecord, LinkStatus } from '../domain/schema';

const categoryOrder: AgencyCategory[] = [
  'party',
  'people_congress',
  'government',
  'cppcc',
  'court',
  'procuratorate',
  'mass_org',
  'department',
  'other',
];

export function renderNationalView(
  root: HTMLElement,
  agencies: AgencyRecord[],
  statusMap: Map<string, LinkStatus>,
): void {
  const heading = document.createElement('h1');
  heading.textContent = '国家级机关目录';

  const grouped = new Map<AgencyCategory, AgencyRecord[]>();
  for (const category of categoryOrder) grouped.set(category, []);
  for (const agency of agencies) grouped.get(agency.category)?.push(agency);

  const directory = document.createElement('div');
  directory.className = 'directory-list';
  let renderedCategories = 0;

  for (const category of categoryOrder) {
    const categoryAgencies = grouped.get(category) ?? [];
    if (categoryAgencies.length === 0) continue;

    renderedCategories += 1;
    const sectionTitle = document.createElement('h2');
    sectionTitle.dataset.category = category;
    sectionTitle.textContent = agencyCategoryTitles[category];

    const cards = document.createElement('ul');
    cards.className = 'agency-list';
    for (const agency of categoryAgencies) {
      const item = document.createElement('li');
      item.append(renderAgencyCard(agency, statusMap.get(agency.id)));
      cards.append(item);
    }

    const section = document.createElement('section');
    section.className = 'directory-section';
    section.append(sectionTitle, cards);
    directory.append(section);
  }

  if (renderedCategories === 0) {
    const notice = document.createElement('p');
    notice.className = 'empty-state';
    notice.textContent = '数据框架已建立，数据待补全';
    directory.append(notice);
  }

  root.replaceChildren(heading, directory);
}

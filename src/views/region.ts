import { agencyCategoryTitles, renderAgencyCard } from '../components/agency-card';
import { renderBreadcrumbs } from '../components/breadcrumbs';
import { toHash } from '../router';
import type { AgencyCategory, AgencyRecord, LinkStatus, Region } from '../domain/schema';

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

const regionLevelTitles: Record<Region['level'], string> = {
  country: '国家级',
  province: '省级',
  city: '市级',
  county: '县级',
};

export type RegionViewProps = {
  region: Region;
  ancestors: Region[];
  children: Region[];
  agencies: AgencyRecord[];
  statusMap: Map<string, LinkStatus>;
};

export function renderRegionView(root: HTMLElement, props: RegionViewProps): void {
  const { region, ancestors, children } = props;

  const breadcrumbs = renderBreadcrumbs(ancestors, region);

  const levelBadge = document.createElement('span');
  levelBadge.className = 'level-badge';
  levelBadge.textContent = regionLevelTitles[region.level];

  const heading = document.createElement('h1');
  heading.append(region.name, levelBadge);

  const childSectionTitle = document.createElement('h2');
  childSectionTitle.textContent = '下级行政区';

  const childList = document.createElement('ul');
  childList.className = 'region-list';
  for (const child of children) {
    const link = document.createElement('a');
    link.href = toHash({ kind: 'region', regionCode: child.code });
    link.textContent = child.name;

    const item = document.createElement('li');
    item.append(link);
    childList.append(item);
  }

  const childSection = document.createElement('section');
  childSection.className = 'directory-section';
  childSection.append(childSectionTitle, childList);

  if (children.length === 0) {
    const childNotice = document.createElement('p');
    childNotice.className = 'empty-state';
    childNotice.textContent = '下级行政区数据待补全';
    childSection.append(childNotice);
  }

  const currentRegionAgencies = props.agencies.filter(
    (agency) => agency.regionCode === region.code,
  );
  const grouped = new Map<AgencyCategory, AgencyRecord[]>();
  for (const category of categoryOrder) grouped.set(category, []);
  for (const agency of currentRegionAgencies) grouped.get(agency.category)?.push(agency);

  const directory = document.createElement('div');
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
      item.append(renderAgencyCard(agency));
      cards.append(item);
    }

    const section = document.createElement('section');
    section.className = 'directory-section';
    section.append(sectionTitle, cards);
    directory.append(section);
  }

  const agencySectionTitle = document.createElement('h2');
  agencySectionTitle.textContent = `${region.name}机关目录`;
  const agencySection = document.createElement('section');
  agencySection.className = 'directory-section';
  agencySection.append(agencySectionTitle, directory);

  if (renderedCategories === 0) {
    const notice = document.createElement('p');
    notice.className = 'empty-state';
    notice.textContent = '数据框架已建立，数据待补全';
    agencySection.append(notice);
  }

  root.replaceChildren(breadcrumbs, heading, childSection, agencySection);
}

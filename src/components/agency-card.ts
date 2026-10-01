import type { AgencyCategory, AgencyRecord, LinkStatus } from '../domain/schema';
import { renderStatusBadge } from './status-badge';

export const agencyCategoryTitles: Record<AgencyCategory, string> = {
  party: '党中央',
  people_congress: '全国人大',
  government: '政府',
  cppcc: '全国政协',
  court: '法院',
  procuratorate: '检察院',
  mass_org: '群团',
  department: '部门',
  other: '其他',
};

export type AgencyCardData = Pick<AgencyRecord, 'name' | 'siteName' | 'url' | 'category'>;

function createDetail(label: string, value: string): HTMLDListElement {
  const term = document.createElement('dt');
  term.textContent = label;

  const description = document.createElement('dd');
  description.textContent = value;

  const details = document.createElement('dl');
  details.className = 'agency-card__details';
  details.append(term, description);

  return details;
}

export function renderAgencyCard(agency: AgencyCardData, status?: LinkStatus): HTMLElement {
  const card = document.createElement('article');
  card.className = 'agency-card';

  const name = document.createElement('h3');
  name.className = 'agency-card__name';
  name.textContent = agency.name;

  const header = document.createElement('div');
  header.className = 'agency-card__header';
  header.append(name, renderStatusBadge(status));

  const siteName = createDetail('网站名称', agency.siteName);
  const domain = createDetail('域名', new URL(agency.url).hostname);
  const category = createDetail('类别', agencyCategoryTitles[agency.category]);

  const officialLink = document.createElement('a');
  officialLink.className = 'button button--primary';
  officialLink.href = agency.url;
  officialLink.target = '_blank';
  officialLink.rel = 'noopener noreferrer';
  officialLink.textContent = '打开官网';

  const copyButton = document.createElement('button');
  copyButton.className = 'button';
  copyButton.type = 'button';
  copyButton.textContent = '复制网址';
  copyButton.addEventListener('click', () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      copyButton.textContent = '复制失败';
      return;
    }

    void clipboard
      .writeText(agency.url)
      .then(() => {
        copyButton.textContent = '已复制';
      })
      .catch(() => {
        copyButton.textContent = '复制失败';
      });
  });

  const actions = document.createElement('div');
  actions.className = 'agency-card__actions';
  actions.append(officialLink, copyButton);

  const content = document.createElement('div');
  content.className = 'agency-card__content';
  content.append(header, siteName, domain, category);

  card.append(content, actions);

  return card;
}

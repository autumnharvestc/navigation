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

export type AgencyCardData = Pick<
  AgencyRecord,
  'name' | 'siteName' | 'url' | 'category' | 'sourceUrl'
>;

function createDetail(label: string, value: string | Node): HTMLDListElement {
  const term = document.createElement('dt');
  term.textContent = label;

  const description = document.createElement('dd');
  if (typeof value === 'string') {
    description.textContent = value;
  } else {
    description.append(value);
  }

  const details = document.createElement('dl');
  details.className = 'agency-card__details';
  details.append(term, description);

  return details;
}

function formatCheckedAt(checkedAt: string): string {
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return '未知时间';

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
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

  const sourceLink = document.createElement('a');
  sourceLink.href = agency.sourceUrl;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.textContent = '查看来源';
  const source = createDetail('来源', sourceLink);

  const lastCheckedAt = status
    ? createDetail('最后核验时间', formatCheckedAt(status.checkedAt))
    : undefined;

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
  content.append(header, siteName, domain, category, source);
  if (lastCheckedAt) content.append(lastCheckedAt);

  card.append(content, actions);

  return card;
}

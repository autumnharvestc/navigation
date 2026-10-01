import { agencyCategoryTitles, renderAgencyCard } from '../components/agency-card';
import { toHash } from '../router';
import { createSearchEngine, searchDocuments } from '../data/search';
import type { SearchDocument } from '../data/build-index';
import type { AgencyCategory, LinkStatus, Region } from '../domain/schema';

export type SearchViewOptions = {
  documents: SearchDocument[];
  statusMap: Map<string, LinkStatus>;
  initialQuery: string;
};

const levelTitles: Record<Region['level'], string> = {
  country: '国家级',
  province: '省级',
  city: '市级',
  county: '县级',
};

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

function appendOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

export function renderSearchView(root: HTMLElement, options: SearchViewOptions): () => void {
  const heading = document.createElement('h1');
  heading.textContent = '全域搜索';

  const queryLabel = document.createElement('label');
  queryLabel.className = 'search-form__label';
  queryLabel.textContent = '关键词';

  const input = document.createElement('input');
  input.type = 'search';
  input.value = options.initialQuery;
  input.name = 'query';
  queryLabel.append(input);

  const levelLabel = document.createElement('label');
  levelLabel.className = 'search-form__label';
  levelLabel.textContent = '层级';

  const level = document.createElement('select');
  level.dataset.filter = 'level';
  level.name = 'level';
  appendOption(level, '', '全部');
  for (const [value, title] of Object.entries(levelTitles)) appendOption(level, value, title);
  levelLabel.append(level);

  const categoryLabel = document.createElement('label');
  categoryLabel.className = 'search-form__label';
  categoryLabel.textContent = '类别';

  const category = document.createElement('select');
  category.dataset.filter = 'category';
  category.name = 'category';
  appendOption(category, '', '全部');
  for (const value of categoryOrder) appendOption(category, value, agencyCategoryTitles[value]);
  categoryLabel.append(category);

  const form = document.createElement('div');
  form.className = 'search-form';
  form.append(queryLabel, levelLabel, categoryLabel);

  const results = document.createElement('div');
  results.className = 'search-results';

  const engine = createSearchEngine(options.documents);
  const renderResults = () => {
    const documents = searchDocuments(engine, input.value, {
      level: (level.value || undefined) as Region['level'] | undefined,
      category: (category.value || undefined) as AgencyCategory | undefined,
    });

    results.replaceChildren();

    for (const resultDocument of documents) {
      const result = document.createElement('article');
      result.dataset.testid = 'search-result';
      result.className = 'search-result';
      result.append(renderAgencyCard(resultDocument, options.statusMap.get(resultDocument.id)));
      results.append(result);
    }

    if (documents.length === 0) {
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = '未找到匹配的官方网站';

      const hint = document.createElement('p');
      hint.className = 'empty-state';
      hint.textContent = '尝试缩短关键词或清除筛选条件';

      results.append(message, hint);
    }
  };

  let debounceTimeout: number | undefined;
  input.addEventListener('input', () => {
    renderResults();
    window.clearTimeout(debounceTimeout);
    debounceTimeout = window.setTimeout(() => {
      history.replaceState(null, '', toHash({ kind: 'search', query: input.value }));
    }, 200);
  });
  level.addEventListener('change', renderResults);
  category.addEventListener('change', renderResults);

  renderResults();
  root.replaceChildren(heading, form, results);

  return () => {
    window.clearTimeout(debounceTimeout);
  };
}

import MiniSearch from 'minisearch';
import type { AgencyRecord, Region } from '../domain/schema';
import type { SearchDocument } from './build-index';

export type SearchFilters = {
  level?: Region['level'];
  category?: AgencyRecord['category'];
  regionCode?: string;
};

export type SearchEngine = {
  readonly miniSearch: MiniSearch<SearchDocument>;
  readonly documentsById: Map<string, SearchDocument>;
};

function tokenize(text: string): string[] {
  return text.match(/[\p{Script=Han}]|[^\s\p{P}]+/gu) ?? [];
}

export function createSearchEngine(documents: SearchDocument[]): SearchEngine {
  const engine = new MiniSearch<SearchDocument>({
    fields: ['name', 'siteName', 'regionName', 'domain'],
    storeFields: ['id'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { name: 3, siteName: 2, regionName: 1, domain: 1 },
    },
    tokenize,
  });

  engine.addAll(documents);

  return {
    miniSearch: engine,
    documentsById: new Map(documents.map((document) => [document.id, document])),
  };
}

function matchesFilters(document: SearchDocument, filters: SearchFilters): boolean {
  if (filters.level !== undefined && document.level !== filters.level) return false;
  if (filters.category !== undefined && document.category !== filters.category) return false;
  if (filters.regionCode !== undefined && document.regionCode !== filters.regionCode) return false;
  return true;
}

export function searchDocuments(
  engine: SearchEngine,
  query: string,
  filters: SearchFilters,
): SearchDocument[] {
  const results =
    query.trim() === ''
      ? engine.miniSearch.search(MiniSearch.wildcard)
      : engine.miniSearch.search(query, { combineWith: 'AND' });

  return results.flatMap((result) => {
    const document = engine.documentsById.get(String(result.id));
    return document && matchesFilters(document, filters) ? [document] : [];
  });
}

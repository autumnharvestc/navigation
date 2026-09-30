import type { AgencyRecord, Region } from '../domain/schema';

export type SearchDocument = {
  id: string;
  name: string;
  siteName: string;
  regionCode: string;
  regionName: string;
  level: Region['level'];
  category: AgencyRecord['category'];
  domain: string;
  url: string;
};

export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

export function toSearchDocument(agency: AgencyRecord, region: Region): SearchDocument {
  return {
    id: agency.id,
    name: agency.name,
    siteName: agency.siteName,
    regionCode: agency.regionCode,
    regionName: region.name,
    level: region.level,
    category: agency.category,
    domain: new URL(agency.url).hostname,
    url: agency.url,
  };
}

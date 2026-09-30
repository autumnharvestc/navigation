import { agencyRecordSchema, regionSchema, type AgencyRecord, type Region } from './schema';

export type Dataset = { regions: Region[]; agencies: AgencyRecord[] };
export type ValidationResult = { errors: string[] };

function issuePath(path: PropertyKey[]): string {
  return path.map((segment) => String(segment)).join('.');
}

export function validateDataset(dataset: Dataset): ValidationResult {
  const errors: string[] = [];
  const regions = new Map<string, Region>();
  const expectedParentLevel = {
    province: 'country',
    city: 'province',
    county: 'city',
  } as const;

  dataset.regions.forEach((region, index) => {
    const parsed = regionSchema.safeParse(region);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`region[${index}].${issuePath(issue.path)}: ${issue.message}`);
      }
    }
    if (regions.has(region.code)) errors.push(`duplicate region code ${region.code}`);
    regions.set(region.code, region);
  });

  dataset.regions.forEach((region) => {
    if (region.code === 'CN') {
      if (region.level !== 'country' || region.parentCode !== null) {
        errors.push('region CN must be the country root with no parent');
      }
      return;
    }
    if (!region.parentCode) {
      errors.push(`region ${region.code}: missing parent`);
      return;
    }
    const parent = regions.get(region.parentCode);
    if (!parent) {
      errors.push(`region ${region.code}: missing parent ${region.parentCode}`);
      return;
    }
    const expected = expectedParentLevel[region.level as keyof typeof expectedParentLevel];
    if (expected && parent.level !== expected) {
      errors.push(`region ${region.code}: parent ${parent.code} must have level ${expected}`);
    }
  });

  const agencyIds = new Set<string>();
  const agencyUrls = new Set<string>();
  dataset.agencies.forEach((agency, index) => {
    const parsed = agencyRecordSchema.safeParse(agency);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`agency[${index}].${issuePath(issue.path)}: ${issue.message}`);
      }
    }
    if (agencyIds.has(agency.id)) errors.push(`duplicate agency id ${agency.id}`);
    agencyIds.add(agency.id);
    const normalizedUrl = agency.url.replace(/\/$/, '').toLowerCase();
    if (agencyUrls.has(normalizedUrl)) errors.push(`duplicate agency url ${agency.url}`);
    agencyUrls.add(normalizedUrl);
    if (!regions.has(agency.regionCode)) {
      errors.push(`agency ${agency.id}: missing region ${agency.regionCode}`);
    }
  });

  return { errors };
}

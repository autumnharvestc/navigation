import { z } from 'zod';

export const agencyCategorySchema = z.enum([
  'party',
  'people_congress',
  'government',
  'cppcc',
  'court',
  'procuratorate',
  'mass_org',
  'department',
  'other',
]);

export const regionSchema = z.object({
  code: z.string().regex(/^(CN|\d{6})$/),
  name: z.string().min(1),
  level: z.enum(['country', 'province', 'city', 'county']),
  parentCode: z
    .string()
    .regex(/^(CN|\d{6})$/)
    .nullable(),
  sort: z.number().int().nonnegative(),
});

export const agencyRecordSchema = z.object({
  id: z.string().min(1),
  regionCode: z.string().regex(/^(CN|\d{6})$/),
  name: z.string().min(1),
  siteName: z.string().min(1),
  url: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'url must use http or https'),
  category: agencyCategorySchema,
  subcategory: z.string().min(1).optional(),
  sourceUrl: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'sourceUrl must use http or https'),
  tags: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});

export const linkStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['valid', 'invalid', 'unknown']),
  httpStatus: z.number().int().optional(),
  checkedAt: z.string().datetime(),
  detail: z.string().min(1).optional(),
});

export type Region = z.infer<typeof regionSchema>;
export type AgencyRecord = z.infer<typeof agencyRecordSchema>;
export type LinkStatus = z.infer<typeof linkStatusSchema>;
export type AgencyCategory = z.infer<typeof agencyCategorySchema>;

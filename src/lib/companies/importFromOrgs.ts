import type { Company, ParseSource } from '../../data/mock';
import type { ExtractedOrg } from '../agent/types';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cityFromAddress(address?: string, city?: string): string {
  if (city?.trim()) return city.trim();
  if (!address) return '—';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? '—';
}

export interface ImportContext {
  niche?: string;
  defaultSource?: ParseSource;
}

export function orgToCompany(org: ExtractedOrg, ctx: ImportContext = {}): Company {
  const now = new Date().toISOString();
  const niche = org.niche ?? ctx.niche ?? 'Из парсера';
  const source = org.source ?? ctx.defaultSource ?? 'manual';

  return {
    id: `agent-${uid()}`,
    name: org.name,
    industry: niche,
    website: org.website ?? '',
    phone: org.phones[0] ?? '',
    email: org.emails[0] ?? '',
    status: 'new',
    employees: 0,
    revenue: '—',
    city: cityFromAddress(org.address, org.city),
    contacts: org.phones.length + org.emails.length,
    activeLeads: 0,
    createdAt: now,
    avatar: org.name.slice(0, 2).toUpperCase(),
    rating: org.rating ?? 0,
    reviewCount: org.reviewCount ?? 0,
    niches: niche ? [niche] : [],
    source,
    address: org.address ?? null,
    phone2: org.phones[1] ?? null,
    source_url: org.cardUrl ?? null,
    notes: org.phones.length === 0 ? 'Телефон не найден при парсинге' : undefined,
  };
}

export function orgsToCompanies(orgs: ExtractedOrg[], ctx: ImportContext = {}): Company[] {
  return orgs.map((org) => orgToCompany(org, ctx));
}

export interface DuplicateCheck {
  org: ExtractedOrg;
  isDuplicate: boolean;
  reason?: string;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function checkDuplicates(orgs: ExtractedOrg[], existing: Company[]): DuplicateCheck[] {
  const byPhone = new Map<string, Company>();
  const byUrl = new Map<string, Company>();
  const byName = new Map<string, Company>();

  for (const c of existing) {
    if (c.phone) byPhone.set(normalizeKey(c.phone), c);
    if (c.source_url) byUrl.set(normalizeKey(c.source_url), c);
    byName.set(normalizeKey(c.name), c);
  }

  return orgs.map((org) => {
    if (org.cardUrl && byUrl.has(normalizeKey(org.cardUrl))) {
      return { org, isDuplicate: true, reason: 'Уже есть по card URL' };
    }
    const phone = org.phones[0];
    if (phone && byPhone.has(normalizeKey(phone))) {
      return { org, isDuplicate: true, reason: 'Уже есть по телефону' };
    }
    if (byName.has(normalizeKey(org.name)) && phone) {
      const ex = byName.get(normalizeKey(org.name));
      if (ex?.phone && normalizeKey(ex.phone) === normalizeKey(phone)) {
        return { org, isDuplicate: true, reason: 'Уже есть по названию и телефону' };
      }
    }
    return { org, isDuplicate: false };
  });
}

export interface ValidatedImportRow {
  index: number;
  org: ExtractedOrg;
  valid: boolean;
  confidence: number;
  issues: string[];
  selected: boolean;
  isDuplicate: boolean;
  normalized?: Partial<Company>;
}

export function mergeValidationWithDuplicates(
  orgs: ExtractedOrg[],
  duplicates: DuplicateCheck[],
  validationItems: Array<{
    index?: number;
    valid?: boolean;
    confidence?: number;
    issues?: string[];
    normalized?: Record<string, unknown>;
  }>,
): ValidatedImportRow[] {
  return orgs.map((org, index) => {
    const dup = duplicates[index];
    const v = validationItems.find((item) => item.index === index) ?? validationItems[index];
    const issues = [...(v?.issues ?? [])];
    if (dup?.isDuplicate && dup.reason) issues.push(dup.reason);

    const valid = Boolean(v?.valid ?? org.name.length >= 2) && !dup?.isDuplicate;
    const confidence = typeof v?.confidence === 'number' ? v.confidence : valid ? 0.7 : 0.3;

    return {
      index,
      org,
      valid,
      confidence,
      issues,
      selected: valid && confidence >= 0.5,
      isDuplicate: dup?.isDuplicate ?? false,
      normalized: v?.normalized as Partial<Company> | undefined,
    };
  });
}

export function rowsToCompanies(rows: ValidatedImportRow[], ctx: ImportContext = {}): Company[] {
  return rows
    .filter((r) => r.selected && r.valid)
    .map((r) => {
      const base = orgToCompany(r.org, ctx);
      const n = r.normalized as Record<string, unknown> | undefined;
      if (!n) return base;
      return {
        ...base,
        name: typeof n.name === 'string' ? n.name : base.name,
        phone: typeof n.phone === 'string' ? n.phone : base.phone,
        address: typeof n.address === 'string' ? n.address : base.address,
        city: typeof n.city === 'string' ? n.city : base.city,
        website: typeof n.website === 'string' ? n.website : base.website,
        source: (n.source as Company['source']) ?? base.source,
        source_url: typeof n.source_url === 'string' ? n.source_url : base.source_url,
        industry:
          typeof n.industry === 'string'
            ? n.industry
            : typeof n.niche === 'string'
              ? n.niche
              : base.industry,
        rating: typeof n.rating === 'number' ? n.rating : base.rating,
        reviewCount: typeof n.reviewCount === 'number' ? n.reviewCount : base.reviewCount,
      };
    });
}

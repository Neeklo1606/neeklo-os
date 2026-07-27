import type { Company, CompanyStatus, ParseSource } from '../../data/mock';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_SOURCES: ParseSource[] = [
  '2gis',
  'yandex',
  'telegram',
  'instagram',
  'rusprofile',
  'avito',
  'manual',
];

const VALID_STATUSES: CompanyStatus[] = [
  'active',
  'inactive',
  'lead',
  'new',
  'approved',
  'queued',
  'sent',
  'replied',
  'qualified',
  'skipped',
];

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

/**
 * Extract the first JSON array of objects from free-form agent text.
 * Handles ```json fenced blocks and raw arrays.
 */
export function extractJsonArray(text: string): Record<string, unknown>[] | null {
  if (!text) return null;

  const candidates: string[] = [];

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((x) => x && typeof x === 'object')) {
        return parsed as Record<string, unknown>[];
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function coerceSource(value: unknown): ParseSource | undefined {
  const s = str(value)?.toLowerCase();
  return s && VALID_SOURCES.includes(s as ParseSource) ? (s as ParseSource) : undefined;
}

function coerceStatus(value: unknown): CompanyStatus {
  const s = str(value)?.toLowerCase();
  return s && VALID_STATUSES.includes(s as CompanyStatus) ? (s as CompanyStatus) : 'new';
}

/** Map one parsed JSON object to a Company record. */
export function jsonRowToCompany(row: Record<string, unknown>, niche?: string): Company {
  const now = new Date().toISOString();
  const name = str(row.name) ?? 'Без названия';
  const phone = str(row.phone) ?? '';
  const email = str(row.email) ?? '';
  const website = str(row.website) ?? '';
  const rowNiche = str(row.niche) ?? niche;
  const revenueM = num(row.revenue_m);
  const reviews = num(row.reviews) ?? num(row.reviewCount) ?? 0;

  return {
    id: `agent-${uid()}`,
    name,
    industry: rowNiche ?? 'Из агента',
    website,
    phone,
    email,
    status: coerceStatus(row.status),
    employees: num(row.employees) ?? 0,
    revenue: revenueM ? `${revenueM} млн ₽` : '—',
    city: str(row.city) ?? '—',
    contacts: (phone ? 1 : 0) + (email ? 1 : 0),
    activeLeads: 0,
    createdAt: now,
    avatar: name.slice(0, 2).toUpperCase(),
    rating: num(row.rating) ?? 0,
    reviewCount: reviews,
    niches: rowNiche ? [rowNiche] : [],
    source: coerceSource(row.source) ?? 'manual',
    address: str(row.address) ?? null,
    inn: str(row.inn) ?? null,
    ogrn: str(row.ogrn) ?? null,
    revenue_m: revenueM,
    founded_year: num(row.founded_year),
    source_url: str(row.card_url) ?? str(row.source_url) ?? null,
  };
}

export function jsonRowsToCompanies(
  rows: Record<string, unknown>[],
  niche?: string,
): Company[] {
  return rows
    .filter((r) => str(r.name))
    .map((r) => jsonRowToCompany(r, niche));
}

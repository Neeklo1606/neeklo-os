import type { ExtractedOrg, ParserJobResult, ParserPage, ParseSource } from './types';

const PHONE_RE = /\+7[\d\s()\-]{10,}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MASKED_PHONE = /\.\.\./;

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function phonesFromText(text: string): string[] {
  return uniqueStrings(text.match(PHONE_RE) ?? []).filter((p) => !MASKED_PHONE.test(p));
}

function emailsFromText(text: string): string[] {
  return uniqueStrings(text.match(EMAIL_RE) ?? []);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === 'string') return value.includes('...') ? [] : [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && !v.includes('...'));
  }
  return [];
}

function inferSourceFromUrl(url?: string): ParseSource | undefined {
  if (!url) return undefined;
  if (url.includes('yandex.ru/maps')) return 'yandex';
  if (url.includes('2gis.ru')) return '2gis';
  return undefined;
}

function orgFromRecord(
  raw: Record<string, unknown>,
  fallbackText = '',
  defaultSource?: ParseSource,
): ExtractedOrg | null {
  const name =
    str(raw.name) ?? str(raw.title) ?? str(raw.organization) ?? str(raw.company);
  if (!name || /^(null|undefined|\?)$/i.test(name)) return null;

  const phones = uniqueStrings([
    ...stringsFrom(raw.phones),
    ...stringsFrom(raw.phone),
    ...phonesFromText(fallbackText),
  ]);
  const emails = uniqueStrings([
    ...stringsFrom(raw.emails),
    ...stringsFrom(raw.email),
    ...emailsFromText(fallbackText),
  ]);

  const cardUrl =
    str(raw.card_url) ?? str(raw.cardUrl) ?? str(raw.finalUrl) ?? str(raw.source_url);
  const source =
    (str(raw.source) as ParseSource | undefined) ??
    inferSourceFromUrl(cardUrl) ??
    defaultSource;

  return {
    name,
    address: str(raw.address),
    city: str(raw.city),
    phones,
    emails,
    website: str(raw.website) ?? str(raw.site),
    cardUrl: cardUrl && !/XXXXX/i.test(cardUrl) ? cardUrl : undefined,
    rating: num(raw.rating),
    reviewCount: num(raw.reviews_count) ?? num(raw.reviewCount),
    source,
    niche: str(raw.niche),
  };
}

function orgsFromData(
  data: unknown,
  textPreview = '',
  defaultSource?: ParseSource,
): ExtractedOrg[] {
  const rec = asRecord(data);
  if (!rec) return [];

  const nested = asRecord(rec.data);
  const buckets = ['organizations', 'orgs', 'companies', 'items', 'contacts', 'results'];

  for (const key of buckets) {
    const arr = asArray(rec[key]).length ? asArray(rec[key]) : asArray(nested?.[key]);
    if (arr.length > 0) {
      return arr
        .map((item) => orgFromRecord(asRecord(item) ?? {}, textPreview, defaultSource))
        .filter((o): o is ExtractedOrg => o !== null);
    }
  }

  if (rec.contacts && asRecord(rec.contacts)) {
    const one = orgFromRecord(
      { name: str(rec.name), niche: str(rec.niche), ...asRecord(rec.contacts)! },
      textPreview,
      defaultSource,
    );
    return one ? [one] : [];
  }

  const single = orgFromRecord(rec, textPreview, defaultSource);
  return single ? [single] : [];
}

export function extractOrgsFromPage(page: ParserPage, defaultSource?: ParseSource): ExtractedOrg[] {
  const text = [page.textPreview, page.title].filter(Boolean).join('\n');
  const fromData = orgsFromData(page.data, text, defaultSource ?? inferSourceFromUrl(page.finalUrl ?? page.url));
  if (fromData.length > 0) return fromData;

  const phones = phonesFromText(text);
  if (phones.length > 0 && page.title) {
    return [
      {
        name: page.title,
        phones,
        emails: emailsFromText(text),
        source: defaultSource ?? inferSourceFromUrl(page.finalUrl ?? page.url),
        cardUrl: page.finalUrl ?? page.url,
      },
    ];
  }
  return [];
}

export function extractOrgsFromResult(
  result?: ParserJobResult,
  defaultSource?: ParseSource,
): ExtractedOrg[] {
  if (!result) return [];

  const fromPages = (result.pages ?? []).flatMap((p) =>
    extractOrgsFromPage(p, defaultSource ?? inferSourceFromUrl(p.finalUrl ?? p.url)),
  );
  if (fromPages.length > 0) return dedupeOrgs(fromPages);

  if (result.answer) {
    const phones = phonesFromText(result.answer);
    if (phones.length > 0) {
      return [{ name: 'Из ответа агента', phones, emails: emailsFromText(result.answer), source: defaultSource }];
    }
  }

  return [];
}

export function dedupeOrgs(orgs: ExtractedOrg[]): ExtractedOrg[] {
  const seen = new Set<string>();
  const out: ExtractedOrg[] = [];
  for (const org of orgs) {
    const key = `${org.name}|${org.phones[0] ?? ''}|${org.address ?? ''}|${org.source ?? ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(org);
  }
  return out;
}

export function extractAllFromExecuted(
  executed: Array<{ result?: ParserJobResult; source?: string; label?: string }>,
): ExtractedOrg[] {
  return dedupeOrgs(
    executed.flatMap((e) => {
      const fromLabel = e.label?.toLowerCase().includes('2gis')
        ? '2gis'
        : e.label?.toLowerCase().includes('яндекс') || e.label?.toLowerCase().includes('yandex')
          ? 'yandex'
          : undefined;
      const source = (e.source as ParseSource | undefined) ?? fromLabel;
      return extractOrgsFromResult(e.result, source);
    }),
  );
}

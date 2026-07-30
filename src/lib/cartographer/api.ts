export type CartographerStage = 'search' | 'extract' | 'exclude' | 'phones' | 'enrich' | 'score' | 'done';
export type CartographerStatus = 'running' | 'completed' | 'failed';

export interface ExclusionFilters {
  retailOnly: boolean;
  noWebsite: boolean;
  federalCorp: boolean;
  microBusiness: boolean;
  duplicates: boolean;
}

export interface ExcludedCompany {
  name: string;
  reason: string;
}

export interface CartographerRun {
  id: string;
  status: CartographerStatus;
  stage: CartographerStage;
  found: number;
  excludedCount: number;
  excluded: ExcludedCompany[];
  phonesTotal: number;
  phonesFetched: number;
  enriched: number;
  campaignId: string;
  niche: string;
  region: string;
  error: string | null;
}

export interface Vertical {
  label: string;
  active: boolean;
  subsegments: string[];
  searchQueries: string[];
  lookFor: string[];
  productArchetype: string;
  excludeIf: string[];
}

const API_BASE =
  (import.meta.env.VITE_CARTOGRAPHER_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/cartographer';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? 'Invalid JSON from cartographer API' : `Cartographer API ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function startCartographerRun(body: {
  niche: string;
  region: string;
  limit: number;
  enrich: boolean;
  verticalKey?: string;
  exclude?: ExclusionFilters;
}) {
  return request<{ success: boolean; runId: string; campaignId: string }>('/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchCartographerRun(runId: string) {
  return request<{ success: boolean } & CartographerRun>(`/run/${encodeURIComponent(runId)}`);
}

export async function fetchVerticals() {
  return request<{ success: boolean; verticals: Record<string, Vertical>; secondPriority: string[] }>('/verticals');
}

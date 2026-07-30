import type { Opportunity } from '../../data/mock';

const API_BASE =
  (import.meta.env.VITE_OPPORTUNITIES_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api/opportunities';

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
    throw new Error(
      res.ok ? 'Invalid JSON from opportunities API' : `Opportunities API ${res.status}: ${text.slice(0, 120)}`,
    );
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchOpportunities(params?: {
  companyId?: string;
  salesPriority?: string;
  humanApproval?: string;
  outcome?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.companyId) qs.set('companyId', params.companyId);
  if (params?.salesPriority) qs.set('salesPriority', params.salesPriority);
  if (params?.humanApproval) qs.set('humanApproval', params.humanApproval);
  if (params?.outcome) qs.set('outcome', params.outcome);
  const q = qs.toString();
  return request<{ success: boolean; opportunities: Opportunity[]; total: number }>(q ? `?${q}` : '');
}

export async function fetchOpportunity(id: string) {
  return request<{ success: boolean; opportunity: Opportunity }>(`/${encodeURIComponent(id)}`);
}

export async function updateOpportunityApi(id: string, partial: Partial<Opportunity>) {
  return request<{ success: boolean; opportunity: Opportunity }>(`/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(partial),
  });
}

export async function generateOpportunitiesBatch(companyIds: string[]) {
  return request<{ success: boolean; generated: Opportunity[]; failed: { id: string; error: string }[] }>(
    '/generate-batch',
    { method: 'POST', body: JSON.stringify({ companyIds }) },
  );
}

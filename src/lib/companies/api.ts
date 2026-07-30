import type { Company, CompanyStatus, Opportunity } from '../../data/mock';

const API_BASE =
  (import.meta.env.VITE_COMPANIES_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api/companies';

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
      res.ok ? 'Invalid JSON from companies API' : `Companies API ${res.status}: ${text.slice(0, 120)}`,
    );
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchCompanies(params?: { search?: string; status?: CompanyStatus }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return request<{ success: boolean; companies: Company[]; total: number }>(
    q ? `?${q}` : '',
  );
}

export async function fetchCompany(id: string) {
  return request<{ success: boolean; company: Company }>(`/${encodeURIComponent(id)}`);
}

export async function createCompanyApi(company: Company) {
  return request<{ success: boolean; company: Company }>('', {
    method: 'POST',
    body: JSON.stringify(company),
  });
}

export async function createCompaniesBulk(companies: Company[]) {
  return request<{ success: boolean; created: Company[]; skipped: number; total: number }>(
    '/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ companies }),
    },
  );
}

export async function updateCompanyApi(id: string, partial: Partial<Company>) {
  return request<{ success: boolean; company: Company }>(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function deleteCompanyApi(id: string) {
  return request<{ success: boolean; id: string }>(`/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function enrichCompanyApi(id: string) {
  return request<{ success: boolean; company: Company }>(`/${encodeURIComponent(id)}/enrich`, {
    method: 'POST',
  });
}

export async function enrichCompaniesBatchApi(ids: string[]) {
  return request<{ success: boolean; enriched: Company[]; failed: { id: string; error: string }[] }>(
    '/enrich-batch',
    { method: 'POST', body: JSON.stringify({ ids }) },
  );
}

export async function scoreCompanyApi(id: string) {
  return request<{ success: boolean; company: Company }>(`/${encodeURIComponent(id)}/score`, {
    method: 'POST',
  });
}

export async function generateOpportunityApi(id: string) {
  return request<{ success: boolean; opportunity: Opportunity }>(
    `/${encodeURIComponent(id)}/generate-opportunity`,
    { method: 'POST' },
  );
}

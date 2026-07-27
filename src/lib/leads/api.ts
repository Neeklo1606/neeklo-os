import type { Lead, LeadStatus } from '../../data/mock';

const API_BASE =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api/leads';

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
      res.ok ? 'Invalid JSON from leads API' : `Leads API ${res.status}: ${text.slice(0, 120)}`,
    );
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchLeads(params?: { search?: string; status?: LeadStatus }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return request<{ success: boolean; leads: Lead[]; total: number }>(q ? `?${q}` : '');
}

export async function fetchLead(id: string) {
  return request<{ success: boolean; lead: Lead }>(`/${encodeURIComponent(id)}`);
}

export async function createLeadApi(lead: Lead) {
  return request<{ success: boolean; lead: Lead }>('', {
    method: 'POST',
    body: JSON.stringify(lead),
  });
}

export async function createLeadsBulk(leads: Lead[]) {
  return request<{ success: boolean; created: Lead[]; skipped: number; total: number }>('/bulk', {
    method: 'POST',
    body: JSON.stringify({ leads }),
  });
}

export async function updateLeadApi(id: string, partial: Partial<Lead>) {
  return request<{ success: boolean; lead: Lead }>(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function deleteLeadApi(id: string) {
  return request<{ success: boolean; id: string }>(`/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

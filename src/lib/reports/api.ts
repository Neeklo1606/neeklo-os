export interface SignalSummary {
  id: string;
  title: string;
  link: string | null;
  why: string;
  signal_score: number | null;
  source_name: string | null;
  date: string | null;
}

export interface CompanySummary {
  id: string;
  name: string;
  city: string | null;
  vertical: string | null;
  fit_score: number | null;
  sales_priority: 'A' | 'B' | 'C' | 'D' | null;
  status: string | null;
  last_checked_at: string | null;
}

export interface OpportunitySummary {
  opportunity_id: string;
  company_id: string;
  sales_priority: string | null;
  personalized_angle: string | null;
  created_at: string;
}

export interface MorningReport {
  generatedAt: string;
  aSignals: { count: number; top: SignalSummary[] };
  bSignals: { count: number };
  newCompanies: { total: number; aPriority: number; bPriority: number };
  decisionsNeeded: {
    researchAPriority: CompanySummary[];
    opportunitiesRequired: OpportunitySummary[];
    unansweredASignals: SignalSummary[];
  };
  overdueFollowUps: CompanySummary[];
  recommendedActions: string[];
}

export interface EveningReport {
  generatedAt: string;
  newSignals: number;
  reviewedManually: number;
  companiesAdded: number;
  aLeadsPrepared: number;
  messagesSent: number;
  repliesReceived: number;
  bestSignal: SignalSummary | null;
  whatDidntWork: {
    sources: { id: string; type: string; label: string }[];
    keywords: string[];
  };
  suggestedChanges: string[];
}

export interface WeeklyMetricsRow {
  date: string;
  channel: string | null;
  segment: string | null;
  stage: string | null;
  lossReason: string | null;
  comment: string | null;
}

export interface WeeklyMetrics {
  generatedAt: string;
  periodDays: number;
  rows: WeeklyMetricsRow[];
  summary: {
    totalLeads: number;
    byChannel: Record<string, number>;
    qualifiedCalls: number;
    presentations: number;
    deals: number;
    leadsWithNoFollowUp: number;
  };
}

const API_BASE =
  (import.meta.env.VITE_REPORTS_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/reports';

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
    throw new Error(res.ok ? 'Invalid JSON from reports API' : `Reports API ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchMorningReport() {
  return request<{ success: boolean; report: MorningReport }>('/morning');
}

export async function fetchEveningReport() {
  return request<{ success: boolean; report: EveningReport }>('/evening');
}

export async function fetchWeeklyMetrics() {
  return request<{ success: boolean; report: WeeklyMetrics }>('/weekly');
}

export async function sendReportNow(type: 'morning' | 'evening') {
  return request<{ success: boolean; report: MorningReport | EveningReport; sent: boolean }>('/send-now', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

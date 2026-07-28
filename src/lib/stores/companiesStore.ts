import { create } from 'zustand';
import type { Company, CompanyStatus } from '../../data/mock';
import {
  createCompaniesBulk,
  createCompanyApi,
  deleteCompanyApi,
  enrichCompanyApi,
  enrichCompaniesBatchApi,
  fetchCompanies,
  scoreCompanyApi,
  updateCompanyApi,
} from '../companies/api';

interface CompaniesState {
  companies: Company[];
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  fetchCompanies: () => Promise<void>;
  setCompanies: (companies: Company[]) => void;
  addCompany: (company: Company) => Promise<void>;
  addCompanies: (companies: Company[]) => Promise<{ created: Company[]; skipped: number }>;
  updateCompany: (id: string, partial: Partial<Company>) => Promise<void>;
  updateStatus: (id: string, status: CompanyStatus) => Promise<void>;
  removeCompany: (id: string) => Promise<void>;
  resetCompanies: () => void;
  restoreCompany: (company: Company) => Promise<void>;
  enrichCompany: (id: string) => Promise<void>;
  enrichCompaniesBatch: (ids: string[]) => Promise<{ enriched: Company[]; failed: { id: string; error: string }[] }>;
  scoreCompaniesBatch: (ids: string[]) => Promise<void>;
}

export const useCompaniesStore = create<CompaniesState>()((set, get) => ({
  companies: [],
  loading: false,
  hydrated: false,
  error: null,

  fetchCompanies: async () => {
    set({ loading: true, error: null });
    try {
      const { companies } = await fetchCompanies();
      set({ companies, loading: false, hydrated: true });
    } catch (e) {
      set({
        loading: false,
        hydrated: true,
        error: e instanceof Error ? e.message : 'Failed to load companies',
      });
    }
  },

  setCompanies: (companies) => set({ companies }),

  addCompany: async (company) => {
    const { company: created } = await createCompanyApi(company);
    set((state) => ({ companies: [...state.companies, created] }));
  },

  addCompanies: async (companies) => {
    const { created, skipped } = await createCompaniesBulk(companies);
    if (created.length) {
      set((state) => ({ companies: [...state.companies, ...created] }));
    }
    return { created, skipped };
  },

  updateCompany: async (id, partial) => {
    const { company } = await updateCompanyApi(id, partial);
    set((state) => ({
      companies: state.companies.map((c) => (c.id === id ? company : c)),
    }));
  },

  updateStatus: async (id, status) => {
    const partial = { status, last_touch: new Date().toISOString() };
    const { company } = await updateCompanyApi(id, partial);
    set((state) => ({
      companies: state.companies.map((c) => (c.id === id ? company : c)),
    }));
  },

  removeCompany: async (id) => {
    await deleteCompanyApi(id);
    set((state) => ({
      companies: state.companies.filter((c) => c.id !== id),
    }));
  },

  resetCompanies: () => set({ companies: [] }),

  restoreCompany: async (company) => {
    const exists = get().companies.some((c) => c.id === company.id);
    if (exists) {
      await get().updateCompany(company.id, company);
    } else {
      await get().addCompany(company);
    }
  },

  enrichCompany: async (id) => {
    const { company } = await enrichCompanyApi(id);
    set((state) => ({ companies: state.companies.map((c) => (c.id === id ? company : c)) }));
  },

  enrichCompaniesBatch: async (ids) => {
    const { enriched, failed } = await enrichCompaniesBatchApi(ids);
    set((state) => ({
      companies: state.companies.map((c) => enriched.find((e) => e.id === c.id) ?? c),
    }));
    return { enriched, failed };
  },

  scoreCompaniesBatch: async (ids) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return (await scoreCompanyApi(id)).company;
        } catch {
          return null;
        }
      }),
    );
    set((state) => ({
      companies: state.companies.map((c) => results.find((r) => r?.id === c.id) ?? c),
    }));
  },
}));

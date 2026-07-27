import { create } from 'zustand';
import type { Lead } from '../../data/mock';
import {
  createLeadApi,
  deleteLeadApi,
  fetchLeads,
  updateLeadApi,
} from '../leads/api';

interface LeadsState {
  leads: Lead[];
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  fetchLeads: () => Promise<void>;
  getLeadById: (id: string) => Lead | undefined;
  setLeads: (leads: Lead[]) => void;
  addLead: (lead: Lead) => Promise<void>;
  updateLead: (id: string, partial: Partial<Lead>) => Promise<void>;
  removeLead: (id: string) => Promise<void>;
  restoreLead: (lead: Lead) => Promise<void>;
}

export const useLeadsStore = create<LeadsState>()((set, get) => ({
  leads: [],
  loading: false,
  hydrated: false,
  error: null,

  fetchLeads: async () => {
    set({ loading: true, error: null });
    try {
      const { leads } = await fetchLeads();
      set({ leads, loading: false, hydrated: true });
    } catch (e) {
      set({
        loading: false,
        hydrated: true,
        error: e instanceof Error ? e.message : 'Failed to load leads',
      });
    }
  },

  getLeadById: (id) => get().leads.find((l) => l.id === id),

  setLeads: (leads) => set({ leads }),

  addLead: async (lead) => {
    const { lead: created } = await createLeadApi(lead);
    set((state) => ({ leads: [...state.leads, created] }));
  },

  updateLead: async (id, partial) => {
    const prev = get().leads;
    set({
      leads: prev.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    });
    try {
      const { lead } = await updateLeadApi(id, partial);
      set({
        leads: get().leads.map((l) => (l.id === id ? lead : l)),
      });
    } catch (e) {
      set({ leads: prev });
      throw e;
    }
  },

  removeLead: async (id) => {
    await deleteLeadApi(id);
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== id),
    }));
  },

  restoreLead: async (lead) => {
    const exists = get().leads.some((l) => l.id === lead.id);
    if (exists) {
      await get().updateLead(lead.id, lead);
    } else {
      await get().addLead(lead);
    }
  },
}));

import { create } from 'zustand';
import type { Campaign, CampaignStatus } from '../../data/mock';
import {
  createCampaignApi,
  deleteCampaignApi,
  fetchCampaigns,
  updateCampaignApi,
} from '../campaigns/api';

interface CampaignsState {
  campaigns: Campaign[];
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  fetchCampaigns: () => Promise<void>;
  setCampaigns: (campaigns: Campaign[]) => void;
  addCampaign: (campaign: Campaign) => Promise<void>;
  updateCampaign: (id: string, partial: Partial<Campaign>) => Promise<void>;
  removeCampaign: (id: string) => Promise<void>;
  restoreCampaign: (campaign: Campaign) => Promise<void>;
}

export const useCampaignsStore = create<CampaignsState>()((set, get) => ({
  campaigns: [],
  loading: false,
  hydrated: false,
  error: null,

  fetchCampaigns: async () => {
    set({ loading: true, error: null });
    try {
      const { campaigns } = await fetchCampaigns();
      set({ campaigns, loading: false, hydrated: true });
    } catch (e) {
      set({
        loading: false,
        hydrated: true,
        error: e instanceof Error ? e.message : 'Failed to load campaigns',
      });
    }
  },

  setCampaigns: (campaigns) => set({ campaigns }),

  addCampaign: async (campaign) => {
    const { campaign: created } = await createCampaignApi(campaign);
    set((state) => ({ campaigns: [...state.campaigns, created] }));
  },

  updateCampaign: async (id, partial) => {
    const { campaign } = await updateCampaignApi(id, partial);
    set((state) => ({
      campaigns: state.campaigns.map((c) => (c.id === id ? campaign : c)),
    }));
  },

  removeCampaign: async (id) => {
    await deleteCampaignApi(id);
    set((state) => ({
      campaigns: state.campaigns.filter((c) => c.id !== id),
    }));
  },

  restoreCampaign: async (campaign) => {
    const exists = get().campaigns.some((c) => c.id === campaign.id);
    if (exists) {
      await get().updateCampaign(campaign.id, campaign);
    } else {
      await get().addCampaign(campaign);
    }
  },
}));

export type { CampaignStatus };

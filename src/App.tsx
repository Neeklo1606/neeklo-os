import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/AppShell';
import { LeadsKanbanPage } from './pages/LeadsKanbanPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { OutreachHubPage } from './pages/OutreachHubPage';
import { ParseLaunchPage } from './pages/ParseLaunchPage';
import { RadarPage } from './pages/RadarPage';
import { QueuePage } from './pages/QueuePage';
import { HomePage } from './pages/HomePage';
import { BrainHudPage } from './pages/BrainHudPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { FinancePage } from './pages/FinancePage';
import { ContentPage } from './pages/ContentPage';
import { AgentPage } from './pages/AgentPage';
import { neekloApi } from './services/neekloApi';
import {
  useCompaniesStore,
} from './lib/stores/companiesStore';
import { useLeadsStore } from './lib/stores/leadsStore';
import { useCampaignsStore } from './lib/stores/campaignsStore';
import { useEffect } from 'react';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <p className="text-[38px] font-heading font-black text-text-primary tracking-tight">
        {title.toUpperCase()}
      </p>
      <p className="text-text-muted text-sm">Страница в разработке</p>
    </div>
  );
}

function CrmStoreBootstrap() {
  const fetchCompanies = useCompaniesStore((s) => s.fetchCompanies);
  const fetchLeads = useLeadsStore((s) => s.fetchLeads);
  const fetchCampaigns = useCampaignsStore((s) => s.fetchCampaigns);
  useEffect(() => {
    fetchCompanies();
    fetchLeads();
    fetchCampaigns();
    neekloApi
      .getMe()
      .then((me) => console.log('NEEKLO API connected:', me.username))
      .catch((e) => console.warn('NEEKLO API not available:', e.message));
  }, [fetchCompanies, fetchLeads, fetchCampaigns]);
  return null;
}

function App() {
  return (
    <BrowserRouter basename="/osnee">
      <CrmStoreBootstrap />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        duration={4000}
        visibleToasts={3}
      />
      <Routes>
        <Route index element={<HomePage />} />
        <Route
          path="/dashboard"
          element={
            <AppShell>
              <DashboardPage />
            </AppShell>
          }
        />
        <Route
          path="/leads"
          element={
            <AppShell>
              <LeadsKanbanPage />
            </AppShell>
          }
        />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route
          path="/outreach"
          element={
            <AppShell>
              <OutreachHubPage />
            </AppShell>
          }
        />
        <Route
          path="/outreach/parse"
          element={
            <AppShell>
              <ParseLaunchPage />
            </AppShell>
          }
        />
        <Route
          path="/outreach/agent"
          element={
            <AppShell>
              <AgentPage />
            </AppShell>
          }
        />
        <Route
          path="/outreach/queue"
          element={
            <AppShell>
              <QueuePage />
            </AppShell>
          }
        />
        <Route
          path="/radar"
          element={
            <AppShell>
              <RadarPage />
            </AppShell>
          }
        />
        <Route
          path="/companies"
          element={
            <AppShell>
              <CompaniesPage />
            </AppShell>
          }
        />
        <Route
          path="/campaigns"
          element={
            <AppShell>
              <CampaignsPage />
            </AppShell>
          }
        />
        <Route
          path="/projects"
          element={
            <AppShell>
              <ProjectsPage />
            </AppShell>
          }
        />
        <Route
          path="/finance"
          element={
            <AppShell>
              <FinancePage />
            </AppShell>
          }
        />
        <Route
          path="/content"
          element={
            <AppShell>
              <ContentPage />
            </AppShell>
          }
        />
        <Route
          path="/brain"
          element={
            <AppShell>
              <BrainHudPage />
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell>
              <PlaceholderPage title="Настройки" />
            </AppShell>
          }
        />
        <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
        <Route path="/outreach/companies/:companyId" element={<CompanyDetailPage />} />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

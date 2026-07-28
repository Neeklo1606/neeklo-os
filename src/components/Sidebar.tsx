import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  X,
  Radar,
  RadioTower,
  Bot,
  ScanLine,
  Send,
  Settings,
  Brain,
  BarChart3,
  Briefcase,
  Wallet,
  Film,
} from 'lucide-react';
import { cn } from '../lib/utils';

const navigationSections = [
  {
    label: 'ГЛАВНАЯ',
    items: [
      { to: '/', label: 'Главная', icon: LayoutDashboard, exact: true },
      { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
      { to: '/brain', label: 'Brain HUD', icon: Brain },
    ],
  },
  {
    label: 'АУТРИЧ',
    items: [
      { to: '/outreach', label: 'Обзор', icon: Radar },
      { to: '/outreach/parse', label: 'Парсинг', icon: ScanLine },
      { to: '/outreach/agent', label: 'Агент', icon: Bot },
      { to: '/radar', label: 'Радар', icon: RadioTower },
      { to: '/companies', label: 'Компании', icon: Building2 },
      { to: '/outreach/queue', label: 'Очередь', icon: Send },
    ],
  },
  {
    label: 'CRM',
    items: [
      { to: '/leads', label: 'Лиды', icon: Users },
      { to: '/campaigns', label: 'Кампании', icon: Megaphone },
      { to: '/projects', label: 'Проекты', icon: Briefcase },
      { to: '/finance', label: 'Финансы', icon: Wallet },
    ],
  },
  {
    label: 'СИСТЕМА',
    items: [
      { to: '/content', label: 'Контент', icon: Film },
      { to: '/settings', label: 'Настройки', icon: Settings },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();

  const isActivePath = (path: string, exact?: boolean) => {
    if (path === '/' || exact) {
      return location.pathname === '/' || location.pathname === '';
    }
    if (path === '/dashboard' || path === '/outreach') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const navContent = (
    <>
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-[rgba(0,0,0,0.055)] px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2563EB] shadow-sm">
          <span className="text-sm font-bold text-white">N</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">NEEKLO OS</p>
            <p className="truncate text-[10px] text-muted-foreground">AI операционная система</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigationSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 pt-5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/25">
              {section.label}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActivePath(item.to, 'exact' in item ? item.exact : undefined)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[rgba(0,0,0,0.055)] p-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 hidden h-dvh flex-col border-r border-[rgba(0,0,0,0.055)] bg-white transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          {/* Sheet */}
          <aside className="relative flex h-dvh w-72 flex-col bg-white shadow-xl animate-in slide-in-from-left">
            <div className="flex h-16 items-center justify-between border-b border-[rgba(0,0,0,0.055)] px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563EB] shadow-sm">
                  <span className="text-sm font-bold text-white">N</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">NEEKLO OS</p>
                  <p className="text-[10px] text-muted-foreground">AI операционная система</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onMobileClose}
                className="flex cursor-pointer items-center justify-center rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Закрыть меню"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {navigationSections.map((section) => (
                <div key={section.label}>
                  <p className="px-3 pt-5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/25">
                    {section.label}
                  </p>
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onMobileClose}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                        isActivePath(item.to, 'exact' in item ? item.exact : undefined)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

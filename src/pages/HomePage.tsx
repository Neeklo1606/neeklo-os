import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  ScanLine,
  RadioTower,
  Building2,
  Send,
  Users,
  Megaphone,
  Brain,
  Briefcase,
  Wallet,
  Film,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

type ModuleStatus = 'live' | 'soon';

interface Module {
  name: string;
  path: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  status: ModuleStatus;
}

const MODULES: Module[] = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    description: 'Обзор и аналитика',
    icon: BarChart3,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent',
    status: 'live',
  },
  {
    name: 'Парсинг',
    path: '/outreach/parse',
    description: 'Найти компании',
    icon: ScanLine,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent-blue',
    status: 'live',
  },
  {
    name: 'Агент',
    path: '/outreach/agent',
    description: 'AI-парсинг через API',
    icon: Bot,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent-blue',
    status: 'live',
  },
  {
    name: 'Радар',
    path: '/radar',
    description: 'Сигналы из Telegram',
    icon: RadioTower,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent-blue',
    status: 'live',
  },
  {
    name: 'Компании',
    path: '/companies',
    description: 'База спарсенных',
    icon: Building2,
    iconBg: 'bg-card-green',
    iconColor: 'text-accent-green',
    status: 'live',
  },
  {
    name: 'Очередь',
    path: '/outreach/queue',
    description: 'Аутрич-тексты',
    icon: Send,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent-blue',
    status: 'live',
  },
  {
    name: 'Лиды',
    path: '/leads',
    description: 'CRM и воронка',
    icon: Users,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent',
    status: 'live',
  },
  {
    name: 'Кампании',
    path: '/campaigns',
    description: 'Источники',
    icon: Megaphone,
    iconBg: 'bg-card-amber',
    iconColor: 'text-accent-amber',
    status: 'live',
  },
  {
    name: 'Проекты',
    path: '/projects',
    description: 'Клиенты и оплаты',
    icon: Briefcase,
    iconBg: 'bg-card-green',
    iconColor: 'text-accent-green',
    status: 'live',
  },
  {
    name: 'Финансы',
    path: '/finance',
    description: 'Касса и расходы',
    icon: Wallet,
    iconBg: 'bg-card-amber',
    iconColor: 'text-accent-amber',
    status: 'live',
  },
  {
    name: 'Brain HUD',
    path: '/brain',
    description: 'Мечтай · Делай · Контроль',
    icon: Brain,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent-blue',
    status: 'live',
  },
  {
    name: 'Content OS',
    path: '/content',
    description: 'Контент-план',
    icon: Film,
    iconBg: 'bg-card-blue',
    iconColor: 'text-accent',
    status: 'live',
  },
  {
    name: 'Настройки',
    path: '/settings',
    description: 'Конфигурация',
    icon: Settings,
    iconBg: 'bg-muted',
    iconColor: 'text-text-body',
    status: 'live',
  },
];

function ModuleCard({ module }: { module: Module }) {
  const navigate = useNavigate();
  const Icon = module.icon;
  const isLive = module.status === 'live';

  return (
    <button
      type="button"
      disabled={!isLive}
      onClick={() => isLive && navigate(module.path)}
      className={cn(
        'group flex flex-col rounded-2xl border border-border bg-card p-5 text-left transition-all',
        isLive
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-md'
          : 'cursor-not-allowed opacity-75',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            module.iconBg,
          )}
        >
          <Icon className={cn('h-5 w-5', module.iconColor)} strokeWidth={2} />
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
            isLive ? 'bg-green-50 text-green-700' : 'bg-muted text-text-muted',
          )}
        >
          {isLive ? 'LIVE' : 'SOON'}
        </span>
      </div>

      <h2 className="mt-4 font-heading text-base font-bold text-text-primary transition-colors group-hover:text-accent">
        {module.name}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{module.description}</p>
    </button>
  );
}

export function HomePage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center sm:mb-14">
          <h1 className="font-heading text-5xl font-black tracking-tight text-text-primary sm:text-6xl">
            NEEKLO OS
          </h1>
          <p className="mt-3 text-sm text-text-muted sm:text-base">Операционная система neeklo.studio</p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((module) => (
            <ModuleCard key={module.name} module={module} />
          ))}
        </div>
      </div>
    </div>
  );
}

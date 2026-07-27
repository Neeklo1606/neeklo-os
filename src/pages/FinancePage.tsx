import { useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, TrendingUp, AlertTriangle, Receipt, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatCurrency } from '../lib/utils';

interface IncomingPayment {
  id: string;
  company: string;
  amount: number;
  dateLabel: string;
  hasReceiveButton?: boolean;
}

const INITIAL_PAYMENTS: IncomingPayment[] = [
  { id: 'pay-1', company: 'ЮГ Акцент', amount: 240_000, dateLabel: '25 июня', hasReceiveButton: true },
  { id: 'pay-2', company: 'РУМИСЫ', amount: 50_000, dateLabel: '30 июня', hasReceiveButton: true },
  { id: 'pay-3', company: 'FITTERA', amount: 60_000, dateLabel: '05 июля' },
  { id: 'pay-4', company: 'РУДН ИИ', amount: 75_000, dateLabel: '15 июля' },
  { id: 'pay-5', company: 'ОМТС', amount: 80_000, dateLabel: '30 июня' },
  { id: 'pay-6', company: 'Академика', amount: 47_000, dateLabel: '28 июня', hasReceiveButton: true },
];

const FIXED_COSTS = [
  { name: 'Кредиты', amount: 70_000 },
  { name: 'ФОТ', amount: 85_000 },
  { name: 'Жизнь/Бали', amount: 100_000 },
];

const DEBT = 1_800_000;
const INITIAL_CASH = 94_000;
const INITIAL_EXPECTED = 697_000;

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'critical' | 'positive' | 'neutral';
  icon: ComponentType<{ className?: string }>;
}) {
  const toneStyles = {
    critical: 'text-red-600',
    positive: 'text-emerald-600',
    neutral: 'text-text-primary',
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-4 w-4 text-text-muted" />
        </div>
      </div>
      <p className={cn('mt-3 font-heading text-3xl font-black tabular-nums tracking-tight', toneStyles[tone])}>
        {value}
      </p>
    </div>
  );
}

export function FinancePage() {
  const navigate = useNavigate();
  const [cash, setCash] = useState(INITIAL_CASH);
  const [expected, setExpected] = useState(INITIAL_EXPECTED);
  const [payments, setPayments] = useState<
    (IncomingPayment & { received: boolean })[]
  >(INITIAL_PAYMENTS.map((p) => ({ ...p, received: false })));

  const monthlyExpenses = useMemo(
    () => FIXED_COSTS.reduce((sum, c) => sum + c.amount, 0),
    [],
  );

  const handleReceive = (id: string) => {
    const payment = payments.find((p) => p.id === id);
    if (!payment || payment.received) return;

    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, received: true } : p)));
    setCash((c) => c + payment.amount);
    setExpected((e) => Math.max(0, e - payment.amount));
    toast.success(`💰 ${formatCurrency(payment.amount)} — ${payment.company}`);
  };

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky inset-x-0 top-0 z-30 border-b border-[rgba(0,0,0,0.055)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm font-black tracking-tight text-foreground">
                ФИНАНСЫ
              </h1>
              <p className="text-[10px] text-muted-foreground">Касса, платежи и расходы</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        {/* Section 1 — stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="В кассе" value={formatCurrency(cash)} tone="critical" icon={Wallet} />
          <StatCard
            label="Ожидается"
            value={formatCurrency(expected)}
            tone="positive"
            icon={TrendingUp}
          />
          <StatCard label="Долг" value={formatCurrency(DEBT)} tone="critical" icon={AlertTriangle} />
          <StatCard
            label="Расходы/мес"
            value={formatCurrency(monthlyExpenses)}
            tone="neutral"
            icon={Receipt}
          />
        </div>

        {/* Section 2 — two columns */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Incoming payments */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              Ожидаемые платежи
            </h2>
            <ul className="mt-4 space-y-2">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-xl border border-border/60 px-3.5 py-3',
                    payment.received ? 'bg-muted/60 opacity-70' : 'bg-bento-base',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium text-text-body',
                        payment.received && 'line-through text-text-muted',
                      )}
                    >
                      {payment.company}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-bold tabular-nums',
                      payment.received ? 'text-text-muted' : 'text-emerald-600',
                    )}
                  >
                    {formatCurrency(payment.amount)}
                  </span>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-text-muted">
                    {payment.dateLabel}
                  </span>
                  {payment.received ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <Check className="h-3 w-3" />
                      Получено
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReceive(payment.id)}
                      className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      Получено
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Fixed costs */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              Обязательные расходы/мес
            </h2>
            <ul className="mt-4 space-y-2">
              {FIXED_COSTS.map((cost) => (
                <li
                  key={cost.name}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-bento-base px-3.5 py-3"
                >
                  <span className="text-sm font-medium text-text-body">{cost.name}</span>
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {formatCurrency(cost.amount)}
                    <span className="ml-0.5 text-xs font-normal text-text-muted">/мес</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-muted px-4 py-3">
              <span className="text-sm font-semibold text-text-body">Итого</span>
              <span className="font-heading text-lg font-black tabular-nums text-text-primary">
                {formatCurrency(monthlyExpenses)}
                <span className="ml-1 text-sm font-medium text-text-muted">/мес</span>
              </span>
            </div>
          </section>
        </div>

        {/* Section 3 — AI recommendation */}
        <section className="mt-6 rounded-2xl bg-bento-dark p-6 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              AI рекомендация
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            Критично: получить предоплату ЮГ Акцент (240 000 ₽) до 30 июня.
            <br />
            Без этого дефицит в июле составит 161 000 ₽.
            <br />
            Позвони Владу сегодня.
          </p>
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            → Открыть проект
          </button>
        </section>
      </main>
    </div>
  );
}
